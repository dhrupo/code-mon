import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, ToolCallResult } from 'claude-code'

import type { Pet } from '../types'

const PANE = {
  plugin: 'code-mon',
  component: 'Pane',
  requestId: 'code-mon',
  surface: 'terminal',
  props: {
    title: 'Code-mon',
    isFocused: true,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const HOUR = 3_600_000
const NOW = 50 * HOUR

function playfulPanda(): Pet {
  return {
    animal: 'panda',
    name: 'Bao',
    adoptedAt: NOW - HOUR,
    lastTickAt: NOW,
    lastActiveAt: NOW,
    hungerElapsedMs: 0,
    isNapping: false,
  }
}

type TabEvent = { id: string; kind: string; at: number }
type TabRecord = { tab: string; events: TabEvent[] }
type Setup = {
  sessionId: string
  cwd: string
  store?: Record<string, unknown>
  toolAnswer?: ToolCallResult
  beforeStoreSet?: (key: string, saved: Map<string, unknown>) => void
}

async function startTab($: Engine, on: On, setup: Setup) {
  const sounds: string[] = []
  const world: { sessionId: string; cwd: string; toolAnswer?: ToolCallResult } = { ...setup }
  const saved = new Map<string, unknown>(Object.entries(setup.store ?? {}))
  on('store.get', (_: unknown, e: { key: string }) => ({ value: structuredClone(saved.get(e.key)) }))
  on('store.keys', () => ({ value: [...saved.keys()] }))
  on('store.delete', (_: unknown, e: { key: string }) => {
    saved.delete(e.key)
    return { value: undefined }
  })
  on('store.set', (_: unknown, e: { key: string; value: unknown }) => {
    setup.beforeStoreSet?.(e.key, saved)
    saved.set(e.key, structuredClone(e.value))
    return { value: undefined }
  })
  on('command.register', (_: unknown, e: { name: string }) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.blit', () => ({ value: {} }))
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: world.sessionId }))
  on('session.cwd', () => ({ value: world.cwd }))
  on('env.get', () => ({ value: undefined }))
  on('process.run', (_: unknown, e: { argv: readonly string[] }) => ({
    value: { exitCode: 0, stdout: e.argv[0] === 'uname' ? 'Darwin\n' : '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  on('audio.play', (_: unknown, e: { clip: { asset?: string } }) => {
    sounds.push(e.clip.asset ?? '?')
    return { value: undefined }
  })
  on('tool.call', () => world.toolAnswer ?? { result: {}, text: 'ok' })
  on('classic.PermissionRequest', () => ({}))
  on('turn.complete', (_: unknown, e: { answer: string }) => ({ text: e.answer }))
  const clock = mock.clock(on, { now: NOW })
  await $.session.start({ cwd: setup.cwd, surface: 'terminal', isInteractive: true })
  const tabRecord = (sessionId: string) => saved.get(`tab:${sessionId}`) as TabRecord | undefined
  const asOtherTab = async (cwd: string, act: () => Promise<unknown>) => {
    const own = { sessionId: world.sessionId, cwd: world.cwd }
    Object.assign(world, { sessionId: 's-2', cwd })
    await act()
    Object.assign(world, own)
  }
  return { clock, sounds, world, saved, tabRecord, asOtherTab }
}

test('a failed command passes its result through untouched and records "command-failed" for this tab', async ($, on) => {
  const failed = { result: {}, isError: true as const, text: 'npm ERR! 1 test failed' }
  const { tabRecord } = await startTab($, on, { sessionId: 's-1', cwd: '/work/fluentform', toolAnswer: failed })

  const ran = await $.tool.call({ tool: 'Bash', command: 'npm test' })

  expect(ran).toEqual(failed)
  expect(tabRecord('s-1')?.tab).toBe('fluentform')
  expect(tabRecord('s-1')?.events.map(event => event.kind)).toEqual(['command-failed'])
})

test('a long stack trace counts as a crash, not a plain failure', async ($, on) => {
  const trace = ['Traceback (most recent call last):', ...Array.from({ length: 12 }, (_, i) => `  File "app.py", line ${i}, in run`), 'ValueError: boom'].join('\n')
  const { tabRecord } = await startTab($, on, { sessionId: 's-1', cwd: '/work/api', toolAnswer: { result: {}, isError: true as const, text: trace } })

  await $.tool.call({ tool: 'Bash', command: 'python app.py' })

  expect(tabRecord('s-1')?.events.map(event => event.kind)).toEqual(['crash'])
})

test('a passing test run records "command-passed"; an ordinary command records nothing', async ($, on) => {
  const { tabRecord } = await startTab($, on, { sessionId: 's-1', cwd: '/work/api' })

  await $.tool.call({ tool: 'Bash', command: 'ls -la' })
  await $.tool.call({ tool: 'Bash', command: 'npx vitest run' })

  expect(tabRecord('s-1')?.events.map(event => event.kind)).toEqual(['command-passed'])
})

test('only a permission dialog that really shows records "permission-asked"', async ($, on) => {
  const { tabRecord } = await startTab($, on, { sessionId: 's-1', cwd: '/work/my-app' })

  await $.tool.call({ tool: 'Bash', command: 'rm -rf build' })
  expect(tabRecord('s-1')).toBeUndefined()

  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'rm -rf build' } } as never)
  expect(tabRecord('s-1')?.events.map(event => event.kind)).toEqual(['permission-asked'])
})

test('a turn that took 90 s records "turn-finished"; a 10 s turn does not', async ($, on) => {
  const { tabRecord } = await startTab($, on, { sessionId: 's-1', cwd: '/work/api' })

  await $.turn.complete({ reason: 'answer', answer: 'done', turnId: 't-1', durationMs: 10_000, isAborted: false })
  expect(tabRecord('s-1')).toBeUndefined()

  await $.turn.complete({ reason: 'answer', answer: 'done', turnId: 't-2', durationMs: 90_000, isAborted: false })
  expect(tabRecord('s-1')?.events.map(event => event.kind)).toEqual(['turn-finished'])
})

test('a second tab writing in the middle of this tab\'s write loses nothing', async ($, on) => {
  let hasInterleaved = false
  const { tabRecord } = await startTab($, on, {
    sessionId: 's-1',
    cwd: '/work/api',
    toolAnswer: { result: {}, isError: true as const, text: 'boom' },
    beforeStoreSet: (key, saved) => {
      if (key !== 'tab:s-1' || hasInterleaved) return
      hasInterleaved = true
      saved.set('tab:s-2', { tab: 'other', events: [{ id: 's-2:1', kind: 'crash', at: NOW }] })
    },
  })

  await $.tool.call({ tool: 'Bash', command: 'make' })

  expect(hasInterleaved).toBe(true)
  expect(tabRecord('s-1')?.events).toHaveLength(1)
  expect(tabRecord('s-2')?.events).toHaveLength(1)
})

test('the pane shows a bubble naming the other tab and the pet turns alert', async ($, on) => {
  const { clock, asOtherTab } = await startTab($, on, { sessionId: 's-1', cwd: '/work/api', store: { pet: playfulPanda() } })
  const ui = await $.ui.mount(PANE)

  await clock.advance(500)
  await asOtherTab('/work/my-app', () => $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: {} } as never))
  await clock.advance(1_500)

  expect((await ui.find({ type: 'Text', text: /my-app/ }))?.text).toBe('my-app: needs you!')
  expect((await ui.find({ type: 'Text', text: / the / }))?.text).toContain('alert')
  await ui.unmount()
})

test('the leader pane plays one sound per event; a pane that is not the leader shows the bubble silently', async ($, on) => {
  const { clock, sounds, world, asOtherTab } = await startTab($, on, {
    sessionId: 's-1',
    cwd: '/work/api',
    store: { pet: playfulPanda(), 'pane-leader': { sessionId: 's-9', beatAt: NOW + 3_000 } },
  })
  const ui = await $.ui.mount(PANE)

  await clock.advance(500)
  world.toolAnswer = { result: {}, isError: true as const, text: 'npm ERR!' }
  await asOtherTab('/work/my-app', () => $.tool.call({ tool: 'Bash', command: 'npm test' }))
  await clock.advance(1_500)
  expect((await ui.find({ type: 'Text', text: /my-app/ }))?.text).toBe('my-app: oops')
  expect(sounds).toEqual([])

  await clock.advance(10_000)
  world.toolAnswer = { result: {}, isError: true as const, text: ['Traceback (most recent call last):', ...Array.from({ length: 12 }, () => '  File "a.py", line 1'), 'Error'].join('\n') }
  await asOtherTab('/work/my-app', () => $.tool.call({ tool: 'Bash', command: 'python a.py' }))
  await clock.advance(1_500)
  expect(sounds).toEqual(['sounds/panda-sneeze.wav'])
  await clock.advance(3_000)
  expect(sounds).toEqual(['sounds/panda-sneeze.wav'])
  await ui.unmount()
})

test('no pane open means no sound, even for events from other tabs', async ($, on) => {
  const { clock, sounds, world, asOtherTab, tabRecord } = await startTab($, on, { sessionId: 's-1', cwd: '/work/api', store: { pet: playfulPanda() } })

  world.toolAnswer = { result: {}, isError: true as const, text: 'boom' }
  await asOtherTab('/work/my-app', () => $.tool.call({ tool: 'Bash', command: 'make' }))
  await clock.advance(5_000)

  expect(tabRecord('s-2')?.events).toHaveLength(1)
  expect(sounds).toEqual([])
})
