import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, Timer } from 'claude-code'

import type { Animal, Mood, Pet } from '../types'
import { SCENE_ROWS, drawPetScene, walkOneStep } from './pane-scene'
import type { WalkPosition } from './pane-scene'
import { HUNGRY_AFTER_MS, adoptPet, applyPetEvent, currentMood } from './pet'
import type { PetEvent } from './pet'
import { ANIMALS } from './pet-types'
import { playPetSound, shouldPlaySound, soundForMood } from './sound'
import type { SoundName } from './sound'
import { SPRITE_COLUMNS, spriteFrames } from './sprites'
import { BUBBLE_PHRASE, deleteQuietTabRecords, readTabNewsSince } from './tab-events'

export const PANE_ID = 'code-mon'
const PET_STORE_KEY = 'pet'
const FRAME_MS = 120
const POLL_EVERY_FRAMES = 8
const TICK_MS = 60_000
const BUBBLE_MS = 6_000
const LEADER_KEY = 'pane-leader'
const LEADER_STALE_MS = 5_000
const DAY_MS = 86_400_000
const MAX_NAME_LENGTH = 16
const HOP_LIFTS = [0, 1, 2, 2, 1, 0]
const COMMAND_SOUND: Record<'feed' | 'pet' | 'play' | 'nap', SoundName> = { feed: 'munch', pet: 'purr', play: 'cheer', nap: 'yawn' }
const NO_PET_TEXT = 'No pet yet. Open /codemon to pick one.'
const PET_COMMANDS = [
  { name: 'codemon', description: 'Open the Code-mon pet pane' },
  { name: 'feed', description: 'Feed your Code-mon pet' },
  { name: 'pet', description: 'Pet your Code-mon pet' },
  { name: 'play', description: 'Play with your Code-mon pet' },
  { name: 'nap', description: 'Put your Code-mon pet to sleep and mute it' },
  { name: 'mood', description: "Show your Code-mon pet's name, mood and hunger" },
  { name: 'adopt', description: 'Adopt another animal, e.g. /adopt fox' },
] as const

const petAtom = atom({ plugin: 'code-mon', key: 'pet' } as const, null, { shape: 'pet-1' })
const pickedAnimalAtom = atom({ plugin: 'code-mon', key: 'pickedAnimal' } as const, null)
const bubbleAtom = atom({ plugin: 'code-mon', key: 'bubble' } as const, null)

const animation: {
  walk: WalkPosition
  step: number
  timer?: Timer
  columns: number
  lastNewsAt?: number
  lastTickAt?: number
  lastSoundAt?: number
  bubbleUntil?: number
} = { walk: { x: 0, isFacingLeft: false }, step: 0, columns: SPRITE_COLUMNS }

export function registerPetPane(on: On): void {
  on('session.start', async ($, e, next) => {
    // One refused name (a built-in, another plugin's) must not cost the other commands or the saved pet.
    await Promise.allSettled(PET_COMMANDS.map(command => $.command.register(command)))
    const saved = await $.store.get(PET_STORE_KEY)
    if (isSavedPet(saved)) await update($, petAtom, () => saved)
    return next(e)
  })

  on('command.run', { command: 'codemon' }, async $ => {
    await $.ui.open({ id: PANE_ID, title: 'Code-mon', closeOnEscape: true })
    await applyEventToPet($, { kind: 'pane-opened' })
    return { text: 'Code-mon pane opened.' }
  })

  for (const kind of ['feed', 'pet', 'play', 'nap'] as const) {
    on('command.run', { command: kind }, async $ => {
      const pet = await applyEventToPet($, { kind })
      if (!pet) return { text: NO_PET_TEXT }
      const now = await $.clock.now()
      await playMoodSound($, pet, now, true, COMMAND_SOUND[kind])
      return { text: describePet(pet, now) }
    })
  }

  on('command.run', { command: 'mood' }, async $ => {
    const pet = await readSharedPet($)
    if (!pet) return { text: NO_PET_TEXT }
    return { text: describePet(pet, await $.clock.now()) }
  })

  on('command.run', { command: 'adopt' }, async ($, e) => {
    const animal = toAnimal(e.args.trim().toLowerCase())
    if (!animal) return { text: `Pick one of: ${ANIMALS.join(', ')}. Example: /adopt fox` }
    await update($, pickedAnimalAtom, () => animal)
    await $.ui.open({ id: PANE_ID, title: 'Code-mon', closeOnEscape: true })
    return { text: `Name your ${animal} in the Code-mon pane.` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($, e) => {
    if (e.surface !== 'terminal') {
      const { Text } = $.ui.resolve(e)
      return <Text>Code-mon lives in the terminal. Open it with /codemon there.</Text>
    }
    const { Box, Button, Input, Raster, Select, Text } = $.ui.resolve(e)
    const pet = await read($, petAtom)
    const now = await $.clock.now()

    const picked = await read($, pickedAnimalAtom)
    if (picked || !pet) {
      if (!picked) {
        return (
          <Box flexDirection="column">
            <Text bold>Pick your buddy</Text>
            <Select
              key="animal"
              label="Animal"
              autoFocus
              options={ANIMALS.map(animal => ({ value: animal, label: capitalize(animal) }))}
              onSelect={(value: string) => update($, pickedAnimalAtom, () => toAnimal(value))}
            />
          </Box>
        )
      }
      const preview = spriteFrames(picked, 'playful')[0]!
      return (
        <Box flexDirection="column">
          <Raster
            key="preview"
            columns={SPRITE_COLUMNS}
            rows={SCENE_ROWS}
            cells={drawPetScene({ frame: preview, x: 0, lift: 0, isFacingLeft: false, columns: SPRITE_COLUMNS })}
          />
          <Text>Name your {picked}</Text>
          <Input
            key="name"
            label="Name"
            placeholder="Mochi"
            autoFocus
            onSubmit={async (value: string) => {
              const name = value.trim().slice(0, MAX_NAME_LENGTH) || capitalize(picked)
              await savePet($, adoptPet(picked, name, await $.clock.now()))
              await update($, pickedAnimalAtom, () => null)
            }}
          />
          <Button key="choose-another" label="Choose another" onPress={() => update($, pickedAnimalAtom, () => null)} />
        </Box>
      )
    }

    const columns = Math.max(SPRITE_COLUMNS, Math.min(60, e.props.bodyColumns))
    const bubble = await read($, bubbleAtom)
    animation.lastNewsAt ??= now
    animation.columns = columns
    animation.timer ??= startAnimation($)

    return (
      <Box flexDirection="column">
        {bubble && <Text color="yellow">{bubble}</Text>}
        <Raster key="pet" columns={columns} rows={SCENE_ROWS} cells={drawPetFrame(pet, now, columns)} />
        <Text dimColor>{'─'.repeat(columns)}</Text>
        <Text>{describePet(pet, now)}</Text>
      </Box>
    )
  })

}

function startAnimation($: EngineInterface): Timer {
  const timer = $.clock.every(FRAME_MS, async () => {
    animation.step += 1
    let pet = await read($, petAtom)
    if (!pet) return
    if (animation.step % POLL_EVERY_FRAMES === 0) pet = (await pollOtherTabs($)) ?? pet
    const now = await $.clock.now()
    const shown = await $.ui.blit({ requestId: PANE_ID, key: 'pet', cells: drawPetFrame(pet, now, animation.columns) })
    if ('deny' in shown) {
      timer.cancel()
      animation.timer = undefined
    }
  })
  return timer
}

function drawPetFrame(pet: Pet, now: number, columns: number): string {
  const mood = currentMood(pet, now)
  animation.walk = moveForMood(mood, animation.walk, animation.step, columns)
  const frames = spriteFrames(pet.animal, mood)
  const frame = frames[Math.floor(animation.step / 4) % frames.length]!
  return drawPetScene({ frame, x: animation.walk.x, lift: liftForMood(mood, animation.step), isFacingLeft: animation.walk.isFacingLeft, columns })
}

async function pollOtherTabs($: EngineInterface): Promise<Pet | null> {
  const now = await $.clock.now()
  const isLeader = await claimPaneLeader($, now)
  const news = await readTabNewsSince($, animation.lastNewsAt ?? now)
  const latest = news[news.length - 1]
  if (latest) {
    animation.lastNewsAt = latest.at
    animation.bubbleUntil = now + BUBBLE_MS
    await update($, bubbleAtom, () => `${latest.tab}: ${BUBBLE_PHRASE[latest.kind]}`)
  } else if (animation.bubbleUntil !== undefined && now >= animation.bubbleUntil) {
    animation.bubbleUntil = undefined
    await update($, bubbleAtom, () => null)
  }

  const stored = await $.store.get(PET_STORE_KEY)
  let pet = isSavedPet(stored) ? stored : await read($, petAtom)
  if (!pet) return null
  if (!isLeader) {
    if (JSON.stringify(pet) !== JSON.stringify(await read($, petAtom))) await update($, petAtom, () => pet)
    return pet
  }
  for (const event of news) pet = applyPetEvent(pet, { kind: event.kind }, now)
  const isTickDue = now - (animation.lastTickAt ?? 0) >= TICK_MS
  if (isTickDue) {
    pet = applyPetEvent(pet, { kind: 'tick' }, now)
    animation.lastTickAt = now
  }
  if (news.length > 0 || isTickDue) await savePet($, pet)
  if (isTickDue) await deleteQuietTabRecords($, now)
  if (news.length > 0) await playMoodSound($, pet, now, false)
  return pet
}

// One pane leads: only it applies tab news, ticks hunger and plays sounds, so two open panes never double them.
async function claimPaneLeader($: EngineInterface, now: number): Promise<boolean> {
  const me = await $.session.id()
  const leader = await $.store.get(LEADER_KEY)
  const isOtherLeaderAlive = isPaneLeader(leader) && leader.sessionId !== me && now - leader.beatAt <= LEADER_STALE_MS
  if (isOtherLeaderAlive) return false
  await $.store.set(LEADER_KEY, { sessionId: me, beatAt: now })
  return true
}

async function playMoodSound($: EngineInterface, pet: Pet, now: number, isUserAction: boolean, chosenSound?: SoundName): Promise<void> {
  const name = chosenSound ?? soundForMood(currentMood(pet, now))
  if (!name) return
  const moment = {
    isPaneOpen: animation.timer !== undefined,
    isNapping: chosenSound ? false : pet.isNapping,
    lastPlayedAt: animation.lastSoundAt,
    now,
    isUserAction,
  }
  if (!shouldPlaySound(moment)) return
  animation.lastSoundAt = now
  // Not awaited: a player runs as long as its clip, and the pane must keep animating meanwhile.
  void playPetSound($, { ...moment, animal: pet.animal, name })
}

async function applyEventToPet($: EngineInterface, event: PetEvent): Promise<Pet | null> {
  const pet = await readSharedPet($)
  if (!pet) return null
  const changed = applyPetEvent(pet, event, await $.clock.now())
  await savePet($, changed)
  return changed
}

// Another tab may have adopted, fed or napped the pet since this tab last looked.
async function readSharedPet($: EngineInterface): Promise<Pet | null> {
  const stored = await $.store.get(PET_STORE_KEY)
  return isSavedPet(stored) ? stored : await read($, petAtom)
}

async function savePet($: EngineInterface, pet: Pet): Promise<void> {
  await update($, petAtom, () => pet)
  await $.store.set(PET_STORE_KEY, pet)
}

function moveForMood(mood: Mood, walk: WalkPosition, step: number, columns: number): WalkPosition {
  if (mood === 'dizzy') return { ...walk, isFacingLeft: step % 6 < 3 }
  if (mood === 'hungry' || mood === 'sick' || mood === 'sleepy' || mood === 'alert') return walk
  return step % 2 === 0 ? walkOneStep(walk, columns) : walk
}

function liftForMood(mood: Mood, step: number): number {
  if (mood === 'alert' || mood === 'happy' || mood === 'missed-you') return HOP_LIFTS[step % HOP_LIFTS.length]!
  if (mood === 'playful' && step % 30 < HOP_LIFTS.length) return HOP_LIFTS[step % 30]!
  return 0
}

function describePet(pet: Pet, now: number): string {
  const mood = currentMood(pet, now)
  const day = Math.floor((now - pet.adoptedAt) / DAY_MS) + 1
  const minutesToMeal = Math.ceil((HUNGRY_AFTER_MS - pet.hungerElapsedMs) / 60_000)
  const hunger = minutesToMeal <= 0 ? 'feed me!' : `next meal in ${minutesToMeal}m`
  return `${pet.name} the ${pet.animal} · ${mood.replace('-', ' ')} · ${hunger} · day ${day}`
}

function isSavedPet(value: unknown): value is Pet {
  if (typeof value !== 'object' || value === null) return false
  const pet = value as Partial<Pet>
  return typeof pet.name === 'string' && typeof pet.hungerElapsedMs === 'number' && ANIMALS.includes(pet.animal as Animal)
}

function isPaneLeader(value: unknown): value is { sessionId: string; beatAt: number } {
  return typeof value === 'object' && value !== null && typeof (value as { beatAt?: unknown }).beatAt === 'number'
}

function toAnimal(value: string): Animal | null {
  return ANIMALS.find(animal => animal === value) ?? null
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1)
}
