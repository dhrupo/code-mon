import type { Animal, Mood, Pet } from '../types'

export type { Pet }

export type PetEvent = {
  kind:
    | 'command-failed'
    | 'crash'
    | 'command-passed'
    | 'permission-asked'
    | 'turn-finished'
    | 'feed'
    | 'pet'
    | 'play'
    | 'nap'
    | 'wake'
    | 'pane-opened'
    | 'tick'
}

export const HUNGRY_AFTER_MS = 2 * 60 * 60 * 1000
export const MAX_TICK_GAP_MS = 5 * 60 * 1000
export const DIZZY_MS = 20_000
export const SICK_MS = 30_000
export const HAPPY_MS = 4_000
export const ALERT_MS = 30_000
export const PROUD_MS = 5_000
export const MISSED_YOU_AFTER_MS = 2 * 60 * 60 * 1000
export const MISSED_YOU_MS = 8_000

const MISSED_YOU_MOOD = { mood: 'missed-you', lastsMs: MISSED_YOU_MS } as const

const SHORT_MOOD_BY_EVENT: Partial<Record<PetEvent['kind'], { mood: Mood; lastsMs: number }>> = {
  'command-failed': { mood: 'dizzy', lastsMs: DIZZY_MS },
  crash: { mood: 'sick', lastsMs: SICK_MS },
  'command-passed': { mood: 'happy', lastsMs: HAPPY_MS },
  feed: { mood: 'happy', lastsMs: HAPPY_MS },
  pet: { mood: 'happy', lastsMs: HAPPY_MS },
  play: { mood: 'happy', lastsMs: HAPPY_MS },
  'permission-asked': { mood: 'alert', lastsMs: ALERT_MS },
  'turn-finished': { mood: 'proud', lastsMs: PROUD_MS },
}

// Claude news from any tab must not wake the pet: /nap is the user's mute until they run a command.
const CLAUDE_EVENT_KINDS: ReadonlySet<PetEvent['kind']> = new Set(['command-failed', 'crash', 'command-passed', 'permission-asked', 'turn-finished'])

export function adoptPet(animal: Animal, name: string, now: number): Pet {
  return { animal, name, adoptedAt: now, lastTickAt: now, lastActiveAt: now, hungerElapsedMs: 0, isNapping: false }
}

export function applyPetEvent(pet: Pet, event: PetEvent, now: number): Pet {
  if (event.kind === 'tick') {
    const hungerElapsedMs = pet.hungerElapsedMs + countOpenTabTime(pet.lastTickAt, now)
    return { ...pet, lastTickAt: Math.max(pet.lastTickAt, now), hungerElapsedMs }
  }
  const wasAwayLong = now - pet.lastActiveAt >= MISSED_YOU_AFTER_MS
  const hungerElapsedMs = event.kind === 'feed' ? 0 : pet.hungerElapsedMs
  const isNapping = event.kind === 'nap' || (pet.isNapping && CLAUDE_EVENT_KINDS.has(event.kind))
  const eventMood = SHORT_MOOD_BY_EVENT[event.kind]
  // Claude-signal moods (dizzy, sick, alert, proud) carry news, so the dance only replaces happy or no mood.
  const shortMood = wasAwayLong && (!eventMood || eventMood.mood === 'happy') ? MISSED_YOU_MOOD : eventMood
  const active = { ...pet, hungerElapsedMs, isNapping, lastActiveAt: now }
  if (!shortMood) return { ...active, tempMood: undefined, tempMoodUntil: undefined }
  return { ...active, tempMood: shortMood.mood, tempMoodUntil: now + shortMood.lastsMs }
}

// A longer gap means no pane was open to tick, and hunger only counts while one is.
function countOpenTabTime(lastTickAt: number, now: number): number {
  const gap = now - lastTickAt
  return gap < 0 || gap > MAX_TICK_GAP_MS ? 0 : gap
}

export function currentMood(pet: Pet, now: number): Mood {
  if (pet.isNapping) return 'sleepy'
  if (pet.tempMood && pet.tempMoodUntil !== undefined && now < pet.tempMoodUntil) return pet.tempMood
  if (pet.hungerElapsedMs >= HUNGRY_AFTER_MS) return 'hungry'
  return 'playful'
}
