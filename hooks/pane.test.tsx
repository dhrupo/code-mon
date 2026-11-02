import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

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

function hungryPanda(now: number): Pet {
  return {
    animal: 'panda',
    name: 'Bao',
    adoptedAt: now - 3 * 24 * HOUR,
    lastTickAt: now,
    lastActiveAt: now,
    hungerElapsedMs: 2 * HOUR,
    isNapping: false,
  }
}

function answerEngine(on: On) {
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
}

test('a first run shows the animal picker', async ($, on) => {
  answerEngine(on)
  mock.store(on)
  mock.clock(on, { now: 1_000_000 })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount(PANE)

  expect((await ui.find({ type: 'Text', text: /Pick your buddy/ }))?.text).toContain('Pick your buddy')
  expect(await ui.find({ key: 'animal' })).toBeDefined()
  await ui.unmount()
})

test('picking the panda and naming it Bao shows Bao on the stats line', async ($, on) => {
  answerEngine(on)
  mock.store(on)
  mock.clock(on, { now: 1_000_000 })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount(PANE)

  await ui.select({ key: 'animal', value: 'panda' })
  expect((await ui.find({ type: 'Text', text: /Name your panda/ }))?.text).toContain('Name your panda')
  await ui.input({ key: 'name', text: 'Bao' })

  const stats = await ui.find({ type: 'Text', text: /the panda/ })
  expect(stats?.text).toContain('Bao the panda')
  expect(stats?.text).toContain('playful')
  await ui.unmount()
})

test('choose another goes back from naming to the picker', async ($, on) => {
  answerEngine(on)
  mock.store(on)
  mock.clock(on, { now: 1_000_000 })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount(PANE)

  await ui.select({ key: 'animal', value: 'fox' })
  await ui.press({ key: 'choose-another' })

  expect(await ui.find({ key: 'animal' })).toBeDefined()
  await ui.unmount()
})

test('a pet saved in an earlier session comes back, with its mood as words', async ($, on) => {
  const now = 50 * HOUR
  answerEngine(on)
  mock.store(on, { pet: hungryPanda(now) })
  mock.clock(on, { now })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount(PANE)

  const stats = await ui.find({ type: 'Text', text: /the panda/ })
  expect(stats?.text).toContain('Bao the panda')
  expect(stats?.text).toContain('hungry')
  expect(stats?.text).toContain('day 4')
  await ui.unmount()
})

test('the pet animates while the pane shows, and stops once the pane is gone', async ($, on) => {
  const now = 50 * HOUR
  let blits = 0
  let attemptsWhileGone = 0
  let isMounted = true
  answerEngine(on)
  on('ui.blit', (_, e) => {
    if (e.key !== 'pet') return { value: { deny: 'unknown key' } }
    if (!isMounted) {
      attemptsWhileGone += 1
      return { value: { deny: 'not mounted' } }
    }
    blits += 1
    return { value: {} }
  })
  mock.store(on, { pet: hungryPanda(now) })
  const clock = mock.clock(on, { now })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount(PANE)

  await clock.advance(1_200)
  expect(blits).toBeGreaterThanOrEqual(5)

  isMounted = false
  await clock.advance(1_200)

  expect(attemptsWhileGone).toBe(1)
  await ui.unmount()
})

test('after the pane is redrawn at a new width, the pet keeps animating at that width', async ($, on) => {
  const now = 50 * HOUR
  let mountedColumns = 40
  let blitsAtNewWidth = 0
  answerEngine(on)
  on('ui.blit', (_, e) => {
    if (!('cells' in e)) return { value: { deny: 'not a raster' } }
    const columns = Uint8Array.fromBase64(e.cells).length / 12 / 6
    if (columns !== mountedColumns) return { value: { deny: 'another size' } }
    if (columns === 30) blitsAtNewWidth += 1
    return { value: {} }
  })
  mock.store(on, { pet: hungryPanda(now) })
  const clock = mock.clock(on, { now })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const wide = await $.ui.mount(PANE)
  await clock.advance(500)
  await wide.unmount()

  mountedColumns = 30
  const narrow = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 30 } })
  await clock.advance(1_200)

  expect(blitsAtNewWidth).toBeGreaterThanOrEqual(5)
  await narrow.unmount()
})

test('a napping pet stays visible when the pane gets narrower than where it was', async ($, on) => {
  const now = 50 * HOUR
  let mountedColumns = 60
  let lastCells = ''
  answerEngine(on)
  on('ui.blit', (_, e) => {
    if (!('cells' in e)) return { value: { deny: 'not a raster' } }
    if (Uint8Array.fromBase64(e.cells).length / 12 / 6 !== mountedColumns) return { value: { deny: 'another size' } }
    lastCells = e.cells
    return { value: {} }
  })
  mock.store(on, { pet: { ...hungryPanda(now), hungerElapsedMs: 0 } })
  const clock = mock.clock(on, { now })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const wide = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 60 } })
  await clock.advance(9_000)
  await $.command.run({ command: 'nap', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })
  await wide.unmount()

  mountedColumns = 20
  const narrow = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 20 } })
  await clock.advance(600)

  const words = new Uint32Array(Uint8Array.fromBase64(lastCells).buffer)
  const paintedCells = words.filter((word, i) => i % 3 === 0 && word !== 0x20).length
  expect(paintedCells).toBeGreaterThan(10)
  await narrow.unmount()
})

test('an in-place resize never freezes the pet', async ($, on) => {
  const now = 50 * HOUR
  let mountedColumns = 40
  let blitsAt30 = 0
  answerEngine(on)
  on('ui.blit', (_, e) => {
    if (!('cells' in e)) return { value: { deny: 'not a raster' } }
    const columns = Uint8Array.fromBase64(e.cells).length / 12 / 6
    if (columns !== mountedColumns) return { value: { deny: 'another size' } }
    if (columns === 30) blitsAt30 += 1
    return { value: {} }
  })
  mock.store(on, { pet: { ...hungryPanda(now), hungerElapsedMs: 0 } })
  const clock = mock.clock(on, { now })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount(PANE)
  await clock.advance(500)

  await ui.redraw({ ...PANE.props, bodyColumns: 30 } as never)
  await clock.advance(130)
  mountedColumns = 30
  await clock.advance(1_500)

  expect(blitsAt30).toBeGreaterThanOrEqual(5)
  await ui.unmount()
})
