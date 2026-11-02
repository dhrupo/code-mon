import { expect, test } from 'claude-code/testing'
import { adoptPet, applyPetEvent, currentMood, type Pet } from './pet'

const ADOPTED_AT = 1_000_000
const ONE_MINUTE = 60_000

function tickEveryMinute(pet: Pet, from: number, to: number): Pet {
  let ticked = pet
  for (let at = from + ONE_MINUTE; at <= to; at += ONE_MINUTE) {
    ticked = applyPetEvent(ticked, { kind: 'tick' }, at)
  }
  return ticked
}

function hungryPetActiveAnHourAgo(): Pet {
  const adopted = adoptPet('penguin', 'Pip', ADOPTED_AT)
  const anHourIn = applyPetEvent(tickEveryMinute(adopted, ADOPTED_AT, ADOPTED_AT + 3_600_000), { kind: 'pet' }, ADOPTED_AT + 3_600_000)
  return tickEveryMinute(anHourIn, ADOPTED_AT + 3_600_000, ADOPTED_AT + 7_200_000)
}

const EVENT_AT = ADOPTED_AT + 7_210_000

test('adoptPet gives a fresh, playful, awake pet with the chosen animal and name', () => {
  const pet = adoptPet('panda', 'Bao', ADOPTED_AT)

  expect(pet.animal).toBe('panda')
  expect(pet.name).toBe('Bao')
  expect(pet.adoptedAt).toBe(1_000_000)
  expect(pet.hungerElapsedMs).toBe(0)
  expect(pet.isNapping).toBe(false)
  expect(currentMood(pet, ADOPTED_AT)).toBe('playful')
})

test('1 h 59 min of open-tab ticks after adoption is not hungry yet', () => {
  const pet = tickEveryMinute(adoptPet('cat', 'Mochi', ADOPTED_AT), ADOPTED_AT, ADOPTED_AT + 7_140_000)

  expect(pet.hungerElapsedMs).toBe(7_140_000)
  expect(currentMood(pet, ADOPTED_AT + 7_140_000)).toBe('playful')
})

test('2 h of open-tab ticks after adoption turns the pet hungry', () => {
  const pet = tickEveryMinute(adoptPet('cat', 'Mochi', ADOPTED_AT), ADOPTED_AT, ADOPTED_AT + 7_200_000)

  expect(pet.hungerElapsedMs).toBe(7_200_000)
  expect(currentMood(pet, ADOPTED_AT + 7_260_000)).toBe('hungry')
})

test('a weekend with Claude closed leaves hunger where it was', () => {
  const beforeWeekend = tickEveryMinute(adoptPet('fox', 'Rusty', ADOPTED_AT), ADOPTED_AT, ADOPTED_AT + 3_600_000)

  const afterWeekend = applyPetEvent(beforeWeekend, { kind: 'tick' }, ADOPTED_AT + 3_600_000 + 172_800_000)

  expect(afterWeekend.hungerElapsedMs).toBe(3_600_000)
  expect(currentMood(afterWeekend, ADOPTED_AT + 3_600_000 + 172_800_000 + 60_000)).toBe('playful')
})

test('a tick gap of exactly 5 min still counts toward hunger, 5 min 1 s does not', () => {
  const pet = adoptPet('dog', 'Biscuit', ADOPTED_AT)

  expect(applyPetEvent(pet, { kind: 'tick' }, ADOPTED_AT + 300_000).hungerElapsedMs).toBe(300_000)
  expect(applyPetEvent(pet, { kind: 'tick' }, ADOPTED_AT + 301_000).hungerElapsedMs).toBe(0)
})

test('feeding a hungry pet resets hunger, makes it happy, then back to playful', () => {
  const fed = applyPetEvent(hungryPetActiveAnHourAgo(), { kind: 'feed' }, EVENT_AT)

  expect(fed.hungerElapsedMs).toBe(0)
  expect(currentMood(fed, EVENT_AT)).toBe('happy')
  expect(currentMood(fed, EVENT_AT + 5_000)).toBe('playful')
})

for (const [kind, mood, lastsMs] of [
  ['command-failed', 'dizzy', 20_000],
  ['crash', 'sick', 30_000],
  ['command-passed', 'happy', 4_000],
  ['pet', 'happy', 4_000],
  ['play', 'happy', 4_000],
  ['permission-asked', 'alert', 30_000],
  ['turn-finished', 'proud', 5_000],
] as const) {
  test(`${kind} shows ${mood} for ${lastsMs} ms, then the pet is hungry again`, () => {
    const pet = applyPetEvent(hungryPetActiveAnHourAgo(), { kind }, EVENT_AT)

    expect(currentMood(pet, EVENT_AT)).toBe(mood)
    expect(currentMood(pet, EVENT_AT + lastsMs - 1)).toBe(mood)
    expect(currentMood(pet, EVENT_AT + lastsMs)).toBe('hungry')
    expect(pet.hungerElapsedMs).toBe(7_200_000)
  })
}

test('an alert ends early when the next event arrives', () => {
  const alerted = applyPetEvent(hungryPetActiveAnHourAgo(), { kind: 'permission-asked' }, EVENT_AT)

  const answered = applyPetEvent(alerted, { kind: 'wake' }, EVENT_AT + 2_000)

  expect(currentMood(answered, EVENT_AT + 2_000)).toBe('hungry')
})

test('a napping pet stays sleepy through ticks, even while dizzy and hungry', () => {
  const dizzy = applyPetEvent(hungryPetActiveAnHourAgo(), { kind: 'command-failed' }, EVENT_AT)

  const napping = applyPetEvent(dizzy, { kind: 'nap' }, EVENT_AT + 1_000)
  const stillNapping = applyPetEvent(napping, { kind: 'tick' }, EVENT_AT + 61_000)

  expect(stillNapping.isNapping).toBe(true)
  expect(currentMood(stillNapping, EVENT_AT + 1_000)).toBe('sleepy')
  expect(currentMood(stillNapping, EVENT_AT + 61_000)).toBe('sleepy')
})

test('wake ends the nap', () => {
  const napping = applyPetEvent(hungryPetActiveAnHourAgo(), { kind: 'nap' }, EVENT_AT)

  const awake = applyPetEvent(napping, { kind: 'wake' }, EVENT_AT + 60_000)

  expect(awake.isNapping).toBe(false)
  expect(currentMood(awake, EVENT_AT + 60_000)).toBe('hungry')
})

test('a user command such as feed also ends the nap', () => {
  const napping = applyPetEvent(hungryPetActiveAnHourAgo(), { kind: 'nap' }, EVENT_AT)

  const woken = applyPetEvent(napping, { kind: 'feed' }, EVENT_AT + 60_000)

  expect(woken.isNapping).toBe(false)
  expect(currentMood(woken, EVENT_AT + 60_000)).toBe('happy')
})

test('Claude events from any tab do not wake a napping pet, so nap stays a mute', () => {
  const napping = applyPetEvent(hungryPetActiveAnHourAgo(), { kind: 'nap' }, EVENT_AT)

  for (const kind of ['command-failed', 'crash', 'command-passed', 'permission-asked', 'turn-finished'] as const) {
    const stillNapping = applyPetEvent(napping, { kind }, EVENT_AT + 60_000)
    expect(stillNapping.isNapping).toBe(true)
    expect(currentMood(stillNapping, EVENT_AT + 60_000)).toBe('sleepy')
  }
})

test('feeding 2 h after the last activity starts the missed-you dance for 8 s', () => {
  const pet = applyPetEvent(adoptPet('frog', 'Lily', ADOPTED_AT), { kind: 'feed' }, ADOPTED_AT + 7_200_000)

  expect(currentMood(pet, ADOPTED_AT + 7_200_000)).toBe('missed-you')
  expect(currentMood(pet, ADOPTED_AT + 7_207_999)).toBe('missed-you')
  expect(currentMood(pet, ADOPTED_AT + 7_208_000)).toBe('playful')
})

test('feeding 1 h 59 min after the last activity is a plain happy, no dance', () => {
  const pet = applyPetEvent(adoptPet('frog', 'Lily', ADOPTED_AT), { kind: 'feed' }, ADOPTED_AT + 7_140_000)

  expect(currentMood(pet, ADOPTED_AT + 7_140_000)).toBe('happy')
})

test('a tick 2 h after the last activity does not dance, because nobody may be watching', () => {
  const pet = applyPetEvent(adoptPet('chick', 'Sunny', ADOPTED_AT), { kind: 'tick' }, ADOPTED_AT + 7_200_000)

  expect(currentMood(pet, ADOPTED_AT + 7_200_000)).toBe('playful')
})

test('opening the pane 2 h after the last activity dances once, not on the next open', () => {
  const back = applyPetEvent(adoptPet('chick', 'Sunny', ADOPTED_AT), { kind: 'pane-opened' }, ADOPTED_AT + 7_200_000)
  const reopened = applyPetEvent(back, { kind: 'pane-opened' }, ADOPTED_AT + 7_260_000)

  expect(currentMood(back, ADOPTED_AT + 7_200_000)).toBe('missed-you')
  expect(currentMood(reopened, ADOPTED_AT + 7_260_000)).toBe('playful')
})

test('opening the pane 1 h 59 min after the last activity does not dance', () => {
  const pet = applyPetEvent(adoptPet('chick', 'Sunny', ADOPTED_AT), { kind: 'pane-opened' }, ADOPTED_AT + 7_140_000)

  expect(currentMood(pet, ADOPTED_AT + 7_140_000)).toBe('playful')
})

test('a tick 1 h 59 min after the last activity does not dance', () => {
  const pet = applyPetEvent(adoptPet('chick', 'Sunny', ADOPTED_AT), { kind: 'tick' }, ADOPTED_AT + 7_140_000)

  expect(currentMood(pet, ADOPTED_AT + 7_140_000)).toBe('playful')
})

test('a permission request 2 h after the last activity still shows alert, not the dance', () => {
  const pet = applyPetEvent(adoptPet('dog', 'Biscuit', ADOPTED_AT), { kind: 'permission-asked' }, ADOPTED_AT + 7_200_000)

  expect(currentMood(pet, ADOPTED_AT + 7_200_000)).toBe('alert')
})

test('applyPetEvent never changes the pet it was given', () => {
  const original = hungryPetActiveAnHourAgo()
  const snapshot = JSON.stringify(original)

  for (const kind of ['command-failed', 'crash', 'command-passed', 'permission-asked', 'turn-finished', 'feed', 'pet', 'play', 'nap', 'wake', 'tick'] as const) {
    applyPetEvent(original, { kind }, EVENT_AT)
    applyPetEvent(original, { kind }, EVENT_AT + 172_800_000)
  }

  expect(JSON.stringify(original)).toBe(snapshot)
})

test('a tick that arrives out of order never lowers hunger', () => {
  const pet = tickEveryMinute(adoptPet('hare', 'Clover', ADOPTED_AT), ADOPTED_AT, ADOPTED_AT + 600_000)

  const lateTick = applyPetEvent(pet, { kind: 'tick' }, ADOPTED_AT + 590_000)

  expect(lateTick.hungerElapsedMs).toBe(600_000)
})
