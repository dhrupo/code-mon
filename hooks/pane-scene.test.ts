import { expect, test } from 'claude-code/testing'

import { SCENE_ROWS, drawPetScene, walkOneStep } from './pane-scene'
import type { SpriteFrame } from './sprites'

const DEFAULT_COLOR = 0x01000000
const UPPER_HALF = 0x2580
const LOWER_HALF = 0x2584
const SPACE = 0x20

function frameWithPixels(pixels: Record<number, string>): SpriteFrame {
  return { pixels: Array.from({ length: 120 }, (_, i) => pixels[i] ?? null) }
}

function readCell(cells: string, columns: number, column: number, row: number): number[] {
  const bytes = Uint8Array.fromBase64(cells)
  const words = new Uint32Array(bytes.buffer)
  const at = (row * columns + column) * 3
  return [words[at]!, words[at + 1]!, words[at + 2]!]
}

test('the scene holds exactly columns x SCENE_ROWS cells', () => {
  const cells = drawPetScene({ frame: frameWithPixels({}), x: 0, lift: 0, isFacingLeft: false, columns: 30 })

  expect(Uint8Array.fromBase64(cells).length).toBe(30 * SCENE_ROWS * 12)
})

test('two stacked pixels become one upper-half block with top as foreground and bottom as background', () => {
  // Sprite pixel (col 0, row 8) over (col 0, row 9): the bottom cell row of a resting pet.
  const frame = frameWithPixels({ 96: '#ff0000', 108: '#0000ff' })

  const cells = drawPetScene({ frame, x: 4, lift: 0, isFacingLeft: false, columns: 30 })

  expect(readCell(cells, 30, 4, SCENE_ROWS - 1)).toEqual([UPPER_HALF, 0xff0000, 0x0000ff])
})

test('a pixel with nothing above it becomes a lower-half block on the default background', () => {
  const frame = frameWithPixels({ 108: '#00ff00' })

  const cells = drawPetScene({ frame, x: 0, lift: 0, isFacingLeft: false, columns: 30 })

  expect(readCell(cells, 30, 0, SCENE_ROWS - 1)).toEqual([LOWER_HALF, 0x00ff00, DEFAULT_COLOR])
})

test('empty space is a blank cell in the default colours', () => {
  const cells = drawPetScene({ frame: frameWithPixels({}), x: 0, lift: 0, isFacingLeft: false, columns: 30 })

  expect(readCell(cells, 30, 20, 0)).toEqual([SPACE, DEFAULT_COLOR, DEFAULT_COLOR])
})

test('a lift of 2 pixels raises the pet by one cell row', () => {
  const frame = frameWithPixels({ 96: '#ff0000', 108: '#0000ff' })

  const cells = drawPetScene({ frame, x: 0, lift: 2, isFacingLeft: false, columns: 30 })

  expect(readCell(cells, 30, 0, SCENE_ROWS - 2)).toEqual([UPPER_HALF, 0xff0000, 0x0000ff])
  expect(readCell(cells, 30, 0, SCENE_ROWS - 1)).toEqual([SPACE, DEFAULT_COLOR, DEFAULT_COLOR])
})

test('facing left mirrors the sprite', () => {
  const frame = frameWithPixels({ 108: '#00ff00' })

  const cells = drawPetScene({ frame, x: 0, lift: 0, isFacingLeft: true, columns: 30 })

  expect(readCell(cells, 30, 11, SCENE_ROWS - 1)).toEqual([LOWER_HALF, 0x00ff00, DEFAULT_COLOR])
  expect(readCell(cells, 30, 0, SCENE_ROWS - 1)).toEqual([SPACE, DEFAULT_COLOR, DEFAULT_COLOR])
})

test('the pet walks one column a step and turns around at each wall', () => {
  expect(walkOneStep({ x: 5, isFacingLeft: false }, 30)).toEqual({ x: 6, isFacingLeft: false })
  expect(walkOneStep({ x: 18, isFacingLeft: false }, 30)).toEqual({ x: 18, isFacingLeft: true })
  expect(walkOneStep({ x: 0, isFacingLeft: true }, 30)).toEqual({ x: 0, isFacingLeft: false })
  expect(walkOneStep({ x: 3, isFacingLeft: true }, 30)).toEqual({ x: 2, isFacingLeft: true })
})

test('a pane narrower than the sprite keeps the pet at the left edge', () => {
  expect(walkOneStep({ x: 0, isFacingLeft: false }, 8)).toEqual({ x: 0, isFacingLeft: false })
})
