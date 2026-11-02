import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { CommandRunResult, On } from 'claude-code'

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

function hungryPanda(): Pet {
  return {
    animal: 'panda',
    name: 'Bao',
    adoptedAt: NOW - 3 * 24 * HOUR,
    lastTickAt: NOW,
    lastActiveAt: NOW,
    hungerElapsedMs: 2 * HOUR,
    isNapping: false,
  }
}

async function startWithPet($: Engine, on: On, pet: Pet | undefined, refusedName?: string): Promise<string[]> {
  const registered: string[] = []
  on('command.register', (_: unknown, e: { name: string }) => {
    if (e.name === refusedName) throw new Error(`"/${e.name}" refused: it is a built-in`)
    registered.push(e.name)
    return { value: { command: e.name } }
  })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  mock.store(on, pet ? { pet } : {})
  mock.clock(on, { now: NOW })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  return registered
}

function runCommand($: Engine, command: string, args: string): Promise<CommandRunResult> {
  return $.command.run({
    command,
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  })
}

async function readStatsLine($: Engine): Promise<string | undefined> {
  const ui = await $.ui.mount(PANE)
  const stats = await ui.find({ type: 'Text', text: / the / })
  await ui.unmount()
  return stats?.text
}

test('every pet command is registered', async ($, on) => {
  const registered = await startWithPet($, on, undefined)

  expect(registered).toEqual(expect.arrayContaining(['codemon', 'feed', 'pet', 'play', 'nap', 'mood', 'adopt']))
})

test('/feed fills a hungry pet and makes it happy', async ($, on) => {
  await startWithPet($, on, hungryPanda())

  await runCommand($, 'feed', '')

  const stats = await readStatsLine($)
  expect(stats).toContain('happy')
  expect(stats).toContain('next meal in 120m')
})

test('/pet and /play make the pet happy', async ($, on) => {
  await startWithPet($, on, hungryPanda())

  await runCommand($, 'pet', '')
  expect(await readStatsLine($)).toContain('happy')

  await runCommand($, 'nap', '')
  await runCommand($, 'play', '')
  expect(await readStatsLine($)).toContain('happy')
})

test('/nap puts the pet to sleep until another command wakes it', async ($, on) => {
  await startWithPet($, on, hungryPanda())

  await runCommand($, 'nap', '')
  expect(await readStatsLine($)).toContain('sleepy')

  await runCommand($, 'feed', '')
  expect(await readStatsLine($)).toContain('happy')
})

test('/mood answers with name, animal, mood, hunger and days together', async ($, on) => {
  await startWithPet($, on, hungryPanda())

  const result = await runCommand($, 'mood', '')

  expect(result.text).toBe('Bao the panda · hungry · feed me! · day 4')
})

test('/adopt fox asks for a name and keeps Bao until the fox is named', async ($, on) => {
  await startWithPet($, on, hungryPanda())

  await runCommand($, 'adopt', 'fox')
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: /Name your fox/ }))?.text).toContain('Name your fox')
  await ui.unmount()

  const ui2 = await $.ui.mount(PANE)
  await ui2.input({ key: 'name', text: 'Rusty' })
  expect((await ui2.find({ type: 'Text', text: / the / }))?.text).toContain('Rusty the fox')
  await ui2.unmount()
})

test('/adopt with an unknown animal lists the animals and changes nothing', async ($, on) => {
  await startWithPet($, on, hungryPanda())

  const result = await runCommand($, 'adopt', 'dragon')

  expect(result.text).toBe('Pick one of: cat, dog, hare, fox, penguin, hamster, chick, frog, panda. Example: /adopt fox')
  expect(await readStatsLine($)).toContain('Bao the panda')
})

test('pet commands before any pet is adopted point to /codemon', async ($, on) => {
  await startWithPet($, on, undefined)

  const result = await runCommand($, 'feed', '')

  expect(result.text).toBe('No pet yet. Open /codemon to pick one.')
})

test('a command name the engine refuses does not stop the other commands or the saved pet', async ($, on) => {
  const registered = await startWithPet($, on, hungryPanda(), 'feed')

  expect(registered).toEqual(expect.arrayContaining(['codemon', 'pet', 'play', 'nap', 'mood', 'adopt']))
  expect(registered).not.toContain('feed')
  expect(await readStatsLine($)).toContain('Bao the panda')
})
