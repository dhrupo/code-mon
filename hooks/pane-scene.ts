import { SPRITE_COLUMNS, SPRITE_ROWS } from './sprites'
import type { SpriteFrame } from './sprites'

export const MAX_LIFT_PIXELS = 2
export const SCENE_ROWS = (SPRITE_ROWS + MAX_LIFT_PIXELS) / 2

const DEFAULT_COLOR = 0x01000000
const UPPER_HALF = 0x2580
const LOWER_HALF = 0x2584
const SPACE = 0x20

export type PetScene = { frame: SpriteFrame; x: number; lift: number; isFacingLeft: boolean; columns: number }
export type WalkPosition = { x: number; isFacingLeft: boolean }

export function drawPetScene(scene: PetScene): string {
  const words = new Uint32Array(scene.columns * SCENE_ROWS * 3)
  for (let row = 0; row < SCENE_ROWS; row++) {
    for (let column = 0; column < scene.columns; column++) {
      const top = readScenePixel(scene, column, row * 2)
      const bottom = readScenePixel(scene, column, row * 2 + 1)
      const at = (row * scene.columns + column) * 3
      words.set(encodeHalfBlockCell(top, bottom), at)
    }
  }
  return new Uint8Array(words.buffer).toBase64()
}

export function walkOneStep(position: WalkPosition, columns: number): WalkPosition {
  const maxX = Math.max(0, columns - SPRITE_COLUMNS)
  if (maxX === 0) return { x: 0, isFacingLeft: false }
  if (position.isFacingLeft) {
    return position.x <= 0 ? { x: 0, isFacingLeft: false } : { x: position.x - 1, isFacingLeft: true }
  }
  return position.x >= maxX ? { x: maxX, isFacingLeft: true } : { x: position.x + 1, isFacingLeft: false }
}

function readScenePixel(scene: PetScene, column: number, pixelRow: number): number | undefined {
  const spriteTop = SCENE_ROWS * 2 - SPRITE_ROWS - scene.lift
  const spriteRow = pixelRow - spriteTop
  const spriteColumn = column - scene.x
  if (spriteRow < 0 || spriteRow >= SPRITE_ROWS || spriteColumn < 0 || spriteColumn >= SPRITE_COLUMNS) return undefined
  const sourceColumn = scene.isFacingLeft ? SPRITE_COLUMNS - 1 - spriteColumn : spriteColumn
  const hex = scene.frame.pixels[spriteRow * SPRITE_COLUMNS + sourceColumn]
  return hex ? parseInt(hex.slice(1), 16) : undefined
}

function encodeHalfBlockCell(top: number | undefined, bottom: number | undefined): [number, number, number] {
  if (top !== undefined) return [UPPER_HALF, top, bottom ?? DEFAULT_COLOR]
  if (bottom !== undefined) return [LOWER_HALF, bottom, DEFAULT_COLOR]
  return [SPACE, DEFAULT_COLOR, DEFAULT_COLOR]
}
