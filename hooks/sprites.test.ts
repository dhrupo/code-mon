import { expect, test } from 'claude-code/testing'
import { ANIMALS, MOODS } from './pet-types'
import { spriteFrames, SPRITE_COLUMNS, SPRITE_ROWS } from './sprites'

test('the sprite grid is 12 columns by 10 rows', async () => {
  expect(SPRITE_COLUMNS).toBe(12)
  expect(SPRITE_ROWS).toBe(10)
})

test('every animal has at least 2 frames of 120 pixels for every mood', async () => {
  for (const animal of ANIMALS) {
    for (const mood of MOODS) {
      const frames = spriteFrames(animal, mood)
      expect(frames.length).toBeGreaterThanOrEqual(2)
      for (const frame of frames) expect(frame.pixels.length).toBe(120)
    }
  }
})

test('every pixel is transparent or a #rrggbb colour', async () => {
  const badPixels: string[] = []
  for (const animal of ANIMALS) {
    for (const mood of MOODS) {
      for (const frame of spriteFrames(animal, mood)) {
        for (const pixel of frame.pixels) {
          if (pixel !== null && !/^#[0-9a-f]{6}$/.test(pixel)) badPixels.push(`${animal}/${mood}: ${pixel}`)
        }
      }
    }
  }
  expect(badPixels).toEqual([])
})

test('every mood looks different from playful on its first frame', async () => {
  const lookalikes: string[] = []
  for (const animal of ANIMALS) {
    const playful = spriteFrames(animal, 'playful')[0]!.pixels.join(',')
    for (const mood of MOODS) {
      if (mood === 'playful') continue
      if (spriteFrames(animal, mood)[0]!.pixels.join(',') === playful) lookalikes.push(`${animal}/${mood}`)
    }
  }
  expect(lookalikes).toEqual([])
})

test('the playful cat keeps the approved mockup colours', async () => {
  const pixels = spriteFrames('cat', 'playful')[0]!.pixels
  expect(pixels[0]).toBe(null)
  expect(pixels[2]).toBe('#2a1a10')
  expect(pixels[4 * 12 + 2]).toBe('#1b1b1b')
  expect(pixels[4 * 12 + 3]).toBe('#ffffff')
  expect(pixels[5 * 12 + 1]).toBe('#f0a35e')
  expect(pixels[5 * 12 + 5]).toBe('#ff8fb1')
})

test('the playful panda keeps its black ears and white face', async () => {
  const pixels = spriteFrames('panda', 'playful')[0]!.pixels
  expect(pixels[1]).toBe('#1f1f24')
  expect(pixels[2 * 12 + 2]).toBe('#f4f4f4')
})
