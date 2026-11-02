import type { EngineInterface, On, ToolCallResult } from 'claude-code'

export type TabEventKind = 'command-failed' | 'crash' | 'command-passed' | 'permission-asked' | 'turn-finished'
export type TabEvent = { id: string; kind: TabEventKind; at: number }
export type TabRecord = { tab: string; events: TabEvent[] }
export type TabNews = TabEvent & { tab: string }

export const TAB_KEY_PREFIX = 'tab:'
const KEEP_EVENT_COUNT = 20
const KEEP_EVENT_MS = 10 * 60_000
const LONG_TURN_MS = 60_000
const CRASH_STACK_LINES = 8
const COMMAND_START = String.raw`(?:^|&&|\|\||;)\s*(?:\w+=\S*\s+)*(?:timeout\s+\d+\s+)?`
const TEST_OR_BUILD_COMMAND = new RegExp(
  COMMAND_START +
    String.raw`(?:(?:npm|pnpm|yarn|bun)(?: run)? (?:test|build)\b|(?:npx |bunx )?(?:vitest|jest|pytest|phpunit|mocha|tsc|playwright test)\b|(?:cargo|go) (?:test|build)\b|(?:make|gradle|mvn)\b)`,
)
const STACK_LINE = /^\s+(at |File "|#\d+ )|^Traceback|^panic:|Fatal error|^Exception in thread/

export const BUBBLE_PHRASE: Record<TabEventKind, string> = {
  'command-failed': 'oops',
  crash: 'crashed!',
  'command-passed': 'passed!',
  'permission-asked': 'needs you!',
  'turn-finished': 'done!',
}

export function registerTabEvents(on: On): void {
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    const command = e.tool === 'Bash' && typeof e.command === 'string' ? e.command : undefined
    const kind = classifyToolResult(e.tool, command, ran)
    if (kind) await recordTabEvent($, kind)
    return ran
  })

  on('classic.PermissionRequest', async ($, e, next) => {
    await recordTabEvent($, 'permission-asked')
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (!e.agentId && e.reason === 'answer' && e.durationMs >= LONG_TURN_MS) await recordTabEvent($, 'turn-finished')
    return next(e)
  })
}

export function classifyToolResult(tool: string, command: string | undefined, ran: ToolCallResult): TabEventKind | undefined {
  if (tool !== 'Bash' || ran.deny !== undefined) return undefined
  if (ran.isError && countStackLines(ran.text ?? '') >= CRASH_STACK_LINES) return 'crash'
  // grep with no match or test -f exit non-zero all day; only a test or build run failing is news.
  if (!command || !TEST_OR_BUILD_COMMAND.test(command)) return undefined
  return ran.isError ? 'command-failed' : 'command-passed'
}

// Each tab writes only its own key, so overlapping tabs never overwrite each other's events.
async function recordTabEvent($: EngineInterface, kind: TabEventKind): Promise<void> {
  try {
    const sessionId = await $.session.id()
    const key = TAB_KEY_PREFIX + sessionId
    const now = await $.clock.now()
    const saved = await $.store.get(key)
    const earlier = isTabRecord(saved) ? saved.events.filter(event => now - event.at < KEEP_EVENT_MS) : []
    const events = [...earlier, { id: `${sessionId}:${now}:${earlier.length}`, kind, at: now }].slice(-KEEP_EVENT_COUNT)
    await $.store.set(key, { tab: folderName(await $.session.cwd()), events })
  } catch {
    // The pet is a toy: a failed write must never break the tool call or turn it rides on.
  }
}

export async function readTabNewsSince($: EngineInterface, sinceAt: number): Promise<TabNews[]> {
  const keys = (await $.store.keys()).filter(key => key.startsWith(TAB_KEY_PREFIX))
  const news: TabNews[] = []
  for (const key of keys) {
    const saved = await $.store.get(key)
    if (!isTabRecord(saved)) continue
    for (const event of saved.events) if (event.at > sinceAt) news.push({ ...event, tab: saved.tab })
  }
  return news.sort((a, b) => a.at - b.at)
}

// Without this, every past session would leave a key behind and fill the store's 4 MiB over time.
export async function deleteQuietTabRecords($: EngineInterface, now: number): Promise<void> {
  const keys = (await $.store.keys()).filter(key => key.startsWith(TAB_KEY_PREFIX))
  for (const key of keys) {
    const saved = await $.store.get(key)
    const newestAt = isTabRecord(saved) ? Math.max(0, ...saved.events.map(event => event.at)) : 0
    if (now - newestAt >= KEEP_EVENT_MS) await $.store.delete(key)
  }
}

function countStackLines(text: string): number {
  return text.split('\n').filter(line => STACK_LINE.test(line)).length
}

function folderName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? 'claude'
}

function isTabRecord(value: unknown): value is TabRecord {
  return typeof value === 'object' && value !== null && Array.isArray((value as TabRecord).events) && typeof (value as TabRecord).tab === 'string'
}
