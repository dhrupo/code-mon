import { expect, test } from 'claude-code/testing'
import { type SoundEngine, playPetSound, playerCommand, shouldPlaySound, soundAsset, soundForMood } from './sound'

test('each mood names its sound, and playful makes none', () => {
  expect(soundForMood('happy')).toBe('cheer')
  expect(soundForMood('hungry')).toBe('call')
  expect(soundForMood('dizzy')).toBe('oof')
  expect(soundForMood('sick')).toBe('sneeze')
  expect(soundForMood('alert')).toBe('chirp')
  expect(soundForMood('proud')).toBe('ding')
  expect(soundForMood('sleepy')).toBe('yawn')
  expect(soundForMood('missed-you')).toBe('hello')
  expect(soundForMood('playful')).toBeUndefined()
})

test('a sound lives in the sounds folder under the animal and sound name', () => {
  expect(soundAsset('cat', 'munch')).toBe('sounds/cat-munch.wav')
  expect(soundAsset('penguin', 'hello')).toBe('sounds/penguin-hello.wav')
})

const OPEN_AWAKE = { isPaneOpen: true, isNapping: false, now: 1_000_000, isUserAction: false }

test('an attention sound plays with the pane open and awake, and stays silent with no pane', () => {
  expect(shouldPlaySound(OPEN_AWAKE)).toBe(true)
  expect(shouldPlaySound({ ...OPEN_AWAKE, isPaneOpen: false })).toBe(false)
  expect(shouldPlaySound({ ...OPEN_AWAKE, isPaneOpen: false, isUserAction: true })).toBe(false)
})

test("napping silences every sound, the user's own action too", () => {
  expect(shouldPlaySound({ ...OPEN_AWAKE, isUserAction: true })).toBe(true)
  expect(shouldPlaySound({ ...OPEN_AWAKE, isNapping: true })).toBe(false)
  expect(shouldPlaySound({ ...OPEN_AWAKE, isNapping: true, isUserAction: true })).toBe(false)
})

test('attention sounds play at most once a minute', () => {
  expect(shouldPlaySound({ ...OPEN_AWAKE, lastPlayedAt: 1_000_000 - 60_000 })).toBe(true)
  expect(shouldPlaySound({ ...OPEN_AWAKE, lastPlayedAt: 1_000_000 - 59_999 })).toBe(false)
})

test("the user's own action plays even inside the minute", () => {
  expect(shouldPlaySound({ ...OPEN_AWAKE, isUserAction: true, lastPlayedAt: 1_000_000 - 1_000 })).toBe(true)
})

test('macOS plays through the engine', () => {
  expect(playerCommand('darwin', [], '/p/sounds/cat-munch.wav')).toEqual({ kind: 'builtin' })
})

test('Linux runs the first installed of pw-play, paplay, aplay', () => {
  expect(playerCommand('linux', ['aplay', 'paplay', 'pw-play'], '/p/sounds/cat-munch.wav')).toEqual({
    kind: 'process',
    argv: ['pw-play', '/p/sounds/cat-munch.wav'],
  })
  expect(playerCommand('linux', ['aplay', 'paplay'], '/p/sounds/cat-munch.wav')).toEqual({
    kind: 'process',
    argv: ['paplay', '/p/sounds/cat-munch.wav'],
  })
  expect(playerCommand('linux', ['aplay'], '/p/sounds/cat-munch.wav')).toEqual({
    kind: 'process',
    argv: ['aplay', '-q', '/p/sounds/cat-munch.wav'],
  })
})

test('Linux with no player installed stays silent', () => {
  expect(playerCommand('linux', [], '/p/sounds/cat-munch.wav')).toBeUndefined()
})

test('Windows plays through PowerShell SoundPlayer, quoting the path', () => {
  expect(playerCommand('win32', [], "C:\\Users\\o'neil\\code-mon\\sounds\\cat-munch.wav")).toEqual({
    kind: 'process',
    argv: [
      'powershell.exe',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      "(New-Object Media.SoundPlayer 'C:\\Users\\o''neil\\code-mon\\sounds\\cat-munch.wav').PlaySync()",
    ],
  })
})

type FakeHostSetup = { os: 'Darwin' | 'Linux' | 'Windows'; installed: readonly string[]; isAudioBroken?: boolean }

// A plugin's own $ stands in here: the test kit refuses $.process.run and $.env.get to hooks outside the plugin's module.
function fakeHost(setup: FakeHostSetup) {
  const clips: string[] = []
  const runs: string[][] = []
  const engine: SoundEngine = {
    plugin: { root: '/plugins/code-mon' },
    env: { get: async name => (name === 'OS' && setup.os === 'Windows' ? 'Windows_NT' : undefined) },
    process: {
      run: async argv => {
        runs.push([...argv])
        const found = argv[0] === 'which' ? argv.slice(1).filter(name => setup.installed.includes(name)) : []
        const stdout = argv[0] === 'uname' ? `${setup.os}\n` : found.map(name => `/usr/bin/${name}\n`).join('')
        const exitCode = argv[0] === 'which' && found.length < argv.length - 1 ? 1 : 0
        return { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false }
      },
    },
    audio: {
      play: async clip => {
        clips.push(clip.asset ?? '')
        if (setup.isAudioBroken) throw new Error('no audio device')
      },
    },
  }
  return { engine, clips, runs }
}

const PLAY_NOW = { isPaneOpen: true, isNapping: false, now: 1_000_000, isUserAction: false }

test('on macOS the pet plays its own clip through the engine', async () => {
  const host = fakeHost({ os: 'Darwin', installed: [] })

  expect(await playPetSound(host.engine, { ...PLAY_NOW, animal: 'cat', name: 'munch' })).toBe(true)

  expect(host.clips).toEqual(['sounds/cat-munch.wav'])
  expect(host.runs).toEqual([['uname', '-s']])
})

test('on Linux the pet runs the first installed player on the absolute file', async () => {
  const host = fakeHost({ os: 'Linux', installed: ['aplay', 'paplay'] })

  expect(await playPetSound(host.engine, { ...PLAY_NOW, animal: 'fox', name: 'chirp' })).toBe(true)

  expect(host.clips).toEqual([])
  expect(host.runs.at(-1)).toEqual(['paplay', '/plugins/code-mon/sounds/fox-chirp.wav'])
})

test('on Windows the pet runs PowerShell on the absolute file', async () => {
  const host = fakeHost({ os: 'Windows', installed: [] })

  expect(await playPetSound(host.engine, { ...PLAY_NOW, animal: 'frog', name: 'ding' })).toBe(true)

  expect(host.clips).toEqual([])
  expect(host.runs.length).toBe(1)
  expect(host.runs[0]?.[0]).toBe('powershell.exe')
  expect(host.runs[0]?.[4]).toBe("(New-Object Media.SoundPlayer '/plugins/code-mon/sounds/frog-ding.wav').PlaySync()")
})

test('on Linux with no player installed the pet looks for one, then stays silent', async () => {
  const host = fakeHost({ os: 'Linux', installed: [] })

  expect(await playPetSound(host.engine, { ...PLAY_NOW, animal: 'dog', name: 'oof' })).toBe(false)

  expect(host.runs).toEqual([
    ['uname', '-s'],
    ['which', 'pw-play', 'paplay', 'aplay'],
  ])
  expect(host.clips).toEqual([])
})

test('with no pane open the same sound that played stays silent', async () => {
  const host = fakeHost({ os: 'Darwin', installed: [] })
  expect(await playPetSound(host.engine, { ...PLAY_NOW, animal: 'cat', name: 'chirp' })).toBe(true)
  expect(host.clips.length).toBe(1)

  expect(await playPetSound(host.engine, { ...PLAY_NOW, isPaneOpen: false, animal: 'cat', name: 'chirp' })).toBe(false)

  expect(host.clips.length).toBe(1)
})

test('while napping the same user action that played stays silent', async () => {
  const host = fakeHost({ os: 'Darwin', installed: [] })
  expect(await playPetSound(host.engine, { ...PLAY_NOW, isUserAction: true, animal: 'panda', name: 'purr' })).toBe(true)
  expect(host.clips.length).toBe(1)

  expect(
    await playPetSound(host.engine, { ...PLAY_NOW, isUserAction: true, isNapping: true, animal: 'panda', name: 'purr' }),
  ).toBe(false)

  expect(host.clips.length).toBe(1)
})

test('an attention sound a minute after the last plays, one a moment sooner stays silent', async () => {
  const host = fakeHost({ os: 'Darwin', installed: [] })
  expect(await playPetSound(host.engine, { ...PLAY_NOW, lastPlayedAt: 940_000, animal: 'chick', name: 'call' })).toBe(true)
  expect(host.clips.length).toBe(1)

  expect(await playPetSound(host.engine, { ...PLAY_NOW, lastPlayedAt: 940_001, animal: 'chick', name: 'call' })).toBe(false)

  expect(host.clips.length).toBe(1)
})

test('a clip that fails to play leaves the pet silent instead of throwing', async () => {
  const host = fakeHost({ os: 'Darwin', installed: [], isAudioBroken: true })

  expect(await playPetSound(host.engine, { ...PLAY_NOW, animal: 'hare', name: 'cheer' })).toBe(false)

  expect(host.clips).toEqual(['sounds/hare-cheer.wav'])
})
