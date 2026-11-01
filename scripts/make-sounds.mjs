#!/usr/bin/env node
// Dev-only: writes the original chiptune clips into sounds/. Run: node scripts/make-sounds.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SAMPLE_RATE = 22050
const VOLUME = 0.3
const NOTE_EDGE_SECONDS = 0.006
const FADE_OUT_SECONDS = 0.025
const MAX_CLIP_SECONDS = 0.6
const MAX_FREQUENCY = 5000

const ANIMAL_VOICES = {
  cat: { pitch: 1.4, wave: 'triangle', vibratoHz: 7 },
  dog: { pitch: 0.8, wave: 'square50', vibratoHz: 0 },
  hare: { pitch: 1.7, wave: 'square25', vibratoHz: 0 },
  fox: { pitch: 1.15, wave: 'square12', vibratoHz: 5 },
  penguin: { pitch: 0.95, wave: 'triangle', vibratoHz: 0 },
  hamster: { pitch: 2.0, wave: 'square25', vibratoHz: 9 },
  chick: { pitch: 2.3, wave: 'sine', vibratoHz: 0 },
  frog: { pitch: 0.6, wave: 'square12', vibratoHz: 4 },
  panda: { pitch: 0.7, wave: 'triangle', vibratoHz: 3 },
}

const SOUND_NOTES = {
  munch: [note(330, 300, 0.06), rest(0.035), note(294, 262, 0.06), rest(0.035), note(330, 294, 0.07)],
  cheer: [note(523, 523, 0.07), note(659, 659, 0.07), note(784, 784, 0.07), note(1047, 1047, 0.14)],
  purr: [note(150, 140, 0.42, { tremoloHz: 24 })],
  oof: [note(420, 150, 0.26)],
  sneeze: [note(500, 720, 0.14), rest(0.05), note(0, 0, 0.12, { isNoise: true })],
  chirp: [note(800, 1400, 0.06), rest(0.03), note(900, 1500, 0.07)],
  ding: [note(1568, 1568, 0.36, { isDecaying: true })],
  call: [note(587, 587, 0.12), rest(0.04), note(440, 440, 0.16)],
  yawn: [note(520, 240, 0.5, { tremoloHz: 5 })],
  hello: [note(440, 660, 0.1), rest(0.03), note(880, 880, 0.14)],
}

function note(fromHz, toHz, seconds, extras = {}) {
  return { fromHz, toHz, seconds, ...extras }
}

function rest(seconds) {
  return { fromHz: 0, toHz: 0, seconds, isRest: true }
}

function waveSample(wave, phase) {
  const cycle = phase - Math.floor(phase)
  if (wave === 'sine') return Math.sin(2 * Math.PI * cycle)
  if (wave === 'triangle') return 1 - 4 * Math.abs(cycle - 0.5)
  const duty = { square50: 0.5, square25: 0.25, square12: 0.125 }[wave]
  return cycle < duty ? 1 : -1
}

function makeNoiseSource(seed) {
  let state = seed
  return () => {
    state = (Math.imul(state, 1103515245) + 12345) & 0x7fffffff
    return (state / 0x3fffffff) - 1
  }
}

function renderClip(voice, notes) {
  const samples = []
  const nextNoise = makeNoiseSource(42)
  let phase = 0
  for (const part of notes) {
    const count = Math.round(part.seconds * SAMPLE_RATE)
    const edge = Math.round(NOTE_EDGE_SECONDS * SAMPLE_RATE)
    for (let i = 0; i < count; i++) {
      if (part.isRest) {
        samples.push(0)
        continue
      }
      const progress = i / count
      const time = i / SAMPLE_RATE
      const vibrato = voice.vibratoHz ? 1 + 0.02 * Math.sin(2 * Math.PI * voice.vibratoHz * time) : 1
      const frequency = Math.min(MAX_FREQUENCY, (part.fromHz + (part.toHz - part.fromHz) * progress) * voice.pitch * vibrato)
      phase += frequency / SAMPLE_RATE
      let value = part.isNoise ? nextNoise() * (1 - progress) : waveSample(voice.wave, phase)
      if (part.tremoloHz) value *= 0.6 + 0.4 * Math.sin(2 * Math.PI * part.tremoloHz * time)
      if (part.isDecaying) value *= Math.exp(-6 * progress)
      const edgeGain = Math.min(1, i / edge, (count - 1 - i) / edge)
      samples.push(value * edgeGain)
    }
  }
  const fadeCount = Math.round(FADE_OUT_SECONDS * SAMPLE_RATE)
  for (let i = 0; i < fadeCount && i < samples.length; i++) {
    samples[samples.length - 1 - i] *= i / fadeCount
  }
  return samples
}

function encodeWav8BitMono(samples) {
  const buffer = Buffer.alloc(44 + samples.length)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + samples.length, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(SAMPLE_RATE, 24)
  buffer.writeUInt32LE(SAMPLE_RATE, 28)
  buffer.writeUInt16LE(1, 32)
  buffer.writeUInt16LE(8, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(samples.length, 40)
  samples.forEach((value, index) => {
    const clamped = Math.max(-1, Math.min(1, value * VOLUME))
    buffer.writeUInt8(Math.round(128 + clamped * 127), 44 + index)
  })
  return buffer
}

function readAnimalNames(petTypesSource) {
  const list = petTypesSource.match(/ANIMALS\s*=\s*\[([^\]]*)\]/)
  if (!list) throw new Error('ANIMALS not found in hooks/pet-types.ts')
  return [...list[1].matchAll(/'([^']+)'/g)].map(match => match[1])
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const animals = readAnimalNames(readFileSync(join(root, 'hooks', 'pet-types.ts'), 'utf8'))
const missingVoices = animals.filter(animal => !ANIMAL_VOICES[animal])
if (missingVoices.length > 0) throw new Error(`No voice for: ${missingVoices.join(', ')}`)

const soundsDir = join(root, 'sounds')
mkdirSync(soundsDir, { recursive: true })
let totalBytes = 0
for (const animal of animals) {
  for (const [soundName, notes] of Object.entries(SOUND_NOTES)) {
    const samples = renderClip(ANIMAL_VOICES[animal], notes)
    const seconds = samples.length / SAMPLE_RATE
    if (seconds >= MAX_CLIP_SECONDS) throw new Error(`${animal}-${soundName} is ${seconds.toFixed(2)} s`)
    const wav = encodeWav8BitMono(samples)
    writeFileSync(join(soundsDir, `${animal}-${soundName}.wav`), wav)
    totalBytes += wav.length
  }
}
console.log(`Wrote ${animals.length * Object.keys(SOUND_NOTES).length} clips, ${(totalBytes / 1024).toFixed(0)} KiB`)
