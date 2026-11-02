import type { EngineInterface } from 'claude-code'
import type { Animal, Mood } from './pet-types'

const ATTENTION_GAP_MS = 60_000

export type SoundName = 'munch' | 'cheer' | 'purr' | 'oof' | 'sneeze' | 'chirp' | 'ding' | 'call' | 'yawn' | 'hello'

const SOUND_BY_MOOD: Record<Mood, SoundName | undefined> = {
  playful: undefined,
  happy: 'cheer',
  hungry: 'call',
  dizzy: 'oof',
  sick: 'sneeze',
  alert: 'chirp',
  proud: 'ding',
  sleepy: 'yawn',
  'missed-you': 'hello',
}

export function soundForMood(mood: Mood): SoundName | undefined {
  return SOUND_BY_MOOD[mood]
}

export function soundAsset(animal: Animal, name: SoundName): string {
  return `sounds/${animal}-${name}.wav`
}

export type SoundMoment = {
  isPaneOpen: boolean
  isNapping: boolean
  lastPlayedAt?: number
  now: number
  isUserAction: boolean
}

export function shouldPlaySound(moment: SoundMoment): boolean {
  if (!moment.isPaneOpen || moment.isNapping) return false
  if (moment.isUserAction || moment.lastPlayedAt === undefined) return true
  return moment.now - moment.lastPlayedAt >= ATTENTION_GAP_MS
}

export type HostOs = 'darwin' | 'linux' | 'win32'

const LINUX_PLAYERS = ['pw-play', 'paplay', 'aplay'] as const

export type PlayerCommand = { kind: 'builtin' } | { kind: 'process'; argv: string[] }

export function playerCommand(os: HostOs, installed: readonly string[], absoluteFile: string): PlayerCommand | undefined {
  if (os === 'darwin') return { kind: 'builtin' }
  if (os === 'win32') {
    // PowerShell single-quoted strings escape a quote by doubling it.
    const quotedFile = `'${absoluteFile.replaceAll("'", "''")}'`
    return {
      kind: 'process',
      argv: ['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', `(New-Object Media.SoundPlayer ${quotedFile}).PlaySync()`],
    }
  }
  const player = LINUX_PLAYERS.find(name => installed.includes(name))
  if (player === undefined) return undefined
  return { kind: 'process', argv: player === 'aplay' ? [player, '-q', absoluteFile] : [player, absoluteFile] }
}

export type SoundEngine = {
  plugin: Pick<EngineInterface['plugin'], 'root'>
  env: Pick<EngineInterface['env'], 'get'>
  process: Pick<EngineInterface['process'], 'run'>
  audio: Pick<EngineInterface['audio'], 'play'>
}

async function detectHostOs($: SoundEngine): Promise<HostOs> {
  if ((await $.env.get('OS')) === 'Windows_NT') return 'win32'
  const { stdout } = await $.process.run(['uname', '-s'])
  return stdout.trim() === 'Darwin' ? 'darwin' : 'linux'
}

async function findInstalledLinuxPlayers($: SoundEngine): Promise<string[]> {
  const { stdout } = await $.process.run(['sh', '-c', `command -v ${LINUX_PLAYERS.join(' ')}`])
  return stdout
    .split('\n')
    .map(path => path.trim().split('/').at(-1) ?? '')
    .filter(name => name !== '')
}

export type PetSoundRequest = SoundMoment & { animal: Animal; name: SoundName }

export async function playPetSound($: SoundEngine, request: PetSoundRequest): Promise<boolean> {
  if (!shouldPlaySound(request)) return false
  const asset = soundAsset(request.animal, request.name)
  try {
    const os = await detectHostOs($)
    const installed = os === 'linux' ? await findInstalledLinuxPlayers($) : []
    const command = playerCommand(os, installed, `${$.plugin.root}/${asset}`)
    if (command === undefined) return false
    if (command.kind === 'builtin') await $.audio.play({ asset })
    else await $.process.run(command.argv)
    return true
  } catch {
    return false
  }
}
