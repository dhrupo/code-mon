import type { Animal, Mood } from './pet-types'

export const SPRITE_COLUMNS = 12
export const SPRITE_ROWS = 10

export type SpriteFrame = { pixels: readonly (string | null)[] }

type Grid = string[][]

const TRANSPARENT = '.'
const EYE = 'E'
const OUTLINE = 'X'
const HEART = 'H'
const SNOOZE = 'Z'
const SWIRL = 'D'

const ANIMAL_GRIDS: Record<Animal, readonly string[]> = {
  cat: ['..X......X..', '.XOX....XOX.', '.XOOXXXXOOX.', 'XOOOOOOOOOOX', 'XOEWOOOOEWOX', 'XOOOOPPOOOOX', '.XOOOOOOOOX.', '..XOOOOOOX..', '..XO.XX.OX..', '..XX....XX..'],
  dog: ['............', '.XX......XX.', 'XBBX....XBBX', 'XBBXXXXXXBBX', '.XOOOOOOOOX.', '.XOEWOOEWOX.', '.XOOONNOOOX.', '..XOOPPOOX..', '..XOOOOOOX..', '..XX....XX..'],
  hare: ['..XX..XX....', '..XPX.XPX...', '..XPX.XPX...', '..XOX.XOX...', '.XOOOOOOOX..', 'XOEWOOOEWOX.', 'XOOOOPOOOOX.', '.XOOOOOOOX..', '..XOOOOOX.XX', '..XX...XXXWX'],
  fox: ['.X........X.', 'XOX......XOX', 'XOOX....XOOX', 'XOOOXXXXOOOX', 'XOOOOOOOOOOX', 'XOEOOOOOOEOX', 'XWWWOOOOWWWX', '.XWWWNNWWWX.', '..XWWWWWWX.X', '..XX....XXOX'],
  penguin: ['....XXXX....', '...XKKKKX...', '..XKKKKKKX..', '..XKWEEWKX..', '..XKWWYWWKX.', '..XKWWWWWKX.', '.XKKWWWWWKKX', '.XKKWWWWWKKX', '..XKWWWWWKX.', '...YY..YY...'],
  hamster: ['..XX....XX..', '.XPX....XPX.', '.XOOXXXXOOX.', 'XOOOOOOOOOOX', 'XOEWOOOOEWOX', 'XPPOOWWOOPPX', 'XOOOWWWWOOOX', '.XOOWWWWOOX.', '..XOOOOOOX..', '...XX..XX...'],
  chick: ['............', '....XXXX....', '...XYYYYX...', '..XYYYYYYX..', '..XYEYYEYX..', '..XYYAAYYX..', '..XYYYYYYXX.', '.XYYYYYYYYX.', '..XYYYYYYX..', '...AA..AA...'],
  frog: ['..XXX..XXX..', '.XGWEXXGWEX.', '.XGWWXXGWWX.', 'XGGGGGGGGGGX', 'XGGGGGGGGGGX', 'XGPGXXXXGPGX', '.XGGGGGGGGX.', '..XLLLLLLX..', '.XGX....XGX.', 'XGGX....XGGX'],
  panda: ['.KK......KK.', 'KKKXXXXXXKKK', '.XWWWWWWWWX.', 'XWKKWWWWKKWX', 'XWKEWWWWKEWX', 'XWWWWKKWWWWX', '.XWWWWWWWWX.', '.KKWWWWWWKK.', '.KKWWWWWWKK.', '..KK....KK..'],
}

const SHARED_PALETTE: Record<string, string> = {
  X: '#2a1a10', E: '#1b1b1b', W: '#ffffff', N: '#1b1b1b', P: '#ff8fb1',
  H: '#ff4d6d', Z: '#8fb8ff', D: '#9b59b6',
}

const ANIMAL_PALETTES: Record<Animal, Record<string, string>> = {
  cat: { O: '#f0a35e' },
  dog: { O: '#e9d3a8', B: '#8a5a33', P: '#ff6f91' },
  hare: { O: '#d9d4cf', P: '#ffb3c7', X: '#3a3340' },
  fox: { O: '#e8743b', W: '#fff4e6' },
  penguin: { K: '#2b3448', Y: '#f2b134', W: '#f4f7fb' },
  hamster: { O: '#e7b46a', W: '#fff3dc', P: '#ffb3c7' },
  chick: { Y: '#ffd84d', A: '#f08a24' },
  frog: { G: '#6cc24a', L: '#b7e38b', P: '#ff8fb1', X: '#1f3a17' },
  panda: { K: '#1f1f24', W: '#f4f4f4', X: '#1f1f24' },
}

const SICK_GREEN = '#7ccf5a'

function cloneGrid(grid: Grid): Grid {
  return grid.map(row => [...row])
}

function eyePositions(grid: Grid): [number, number][] {
  const positions: [number, number][] = []
  grid.forEach((row, y) => row.forEach((code, x) => { if (code === EYE) positions.push([y, x]) }))
  return positions
}

function withClosedEyes(grid: Grid): Grid {
  const closed = cloneGrid(grid)
  for (const [y, x] of eyePositions(grid)) {
    closed[y]![x] = OUTLINE
    const right = closed[y]![x + 1]
    if (right !== undefined && right !== EYE && right !== TRANSPARENT) closed[y]![x + 1] = OUTLINE
  }
  return closed
}

function withEyesRecoloured(grid: Grid, code: string): Grid {
  const recoloured = cloneGrid(grid)
  for (const [y, x] of eyePositions(grid)) recoloured[y]![x] = code
  return recoloured
}

function withPixelAboveEyes(grid: Grid, code: string): Grid {
  const changed = cloneGrid(grid)
  for (const [y, x] of eyePositions(grid)) if (y > 0 && changed[y - 1]![x] !== TRANSPARENT) changed[y - 1]![x] = code
  return changed
}

function withPixels(grid: Grid, code: string, positions: [number, number][]): Grid {
  const changed = cloneGrid(grid)
  for (const [y, x] of positions) changed[y]![x] = code
  return changed
}

function sittingLower(grid: Grid): Grid {
  return [Array(SPRITE_COLUMNS).fill(TRANSPARENT), ...cloneGrid(grid).slice(0, -1)]
}

function raisedOneRow(grid: Grid): Grid {
  return [...cloneGrid(grid).slice(1), Array(SPRITE_COLUMNS).fill(TRANSPARENT)]
}

function mirrored(grid: Grid): Grid {
  return grid.map(row => [...row].reverse())
}

const TOP_LEFT: [number, number] = [0, 0]
const TOP_RIGHT: [number, number] = [0, SPRITE_COLUMNS - 1]
const TOP_NEXT_TO_RIGHT: [number, number] = [0, SPRITE_COLUMNS - 2]

const MOOD_FRAMES: Record<Mood, (base: Grid) => Grid[]> = {
  playful: base => [base, withClosedEyes(base)],
  happy: base => [withPixels(withClosedEyes(base), HEART, [TOP_RIGHT]), withClosedEyes(base)],
  hungry: base => {
    const droopy = withPixelAboveEyes(base, OUTLINE)
    return [sittingLower(droopy), droopy]
  },
  dizzy: base => {
    const swirling = withEyesRecoloured(base, SWIRL)
    return [swirling, mirrored(swirling)]
  },
  sick: base => [sittingLower(base), base],
  alert: base => {
    const wideEyed = withPixelAboveEyes(base, EYE)
    return [wideEyed, raisedOneRow(wideEyed)]
  },
  proud: base => [mirrored(base), base],
  sleepy: base => {
    const asleep = sittingLower(withClosedEyes(base))
    return [withPixels(asleep, SNOOZE, [TOP_RIGHT]), withPixels(asleep, SNOOZE, [TOP_NEXT_TO_RIGHT])]
  },
  'missed-you': base => {
    const glad = withClosedEyes(base)
    return [withPixels(glad, HEART, [TOP_LEFT, TOP_RIGHT]), withPixels(glad, HEART, [TOP_RIGHT])]
  },
}

function mixedTowards(colour: string, target: string, share: number): string {
  const channel = (hex: string, offset: number) => parseInt(hex.slice(offset, offset + 2), 16)
  return '#' + [1, 3, 5]
    .map(offset => Math.round(channel(colour, offset) * (1 - share) + channel(target, offset) * share).toString(16).padStart(2, '0'))
    .join('')
}

function paintedFrame(grid: Grid, palette: Record<string, string>, tint: string | null): SpriteFrame {
  return {
    pixels: grid.flat().map(code => {
      const colour = palette[code] ?? null
      if (colour === null || tint === null || code === OUTLINE || code === EYE) return colour
      return mixedTowards(colour, tint, 0.4)
    }),
  }
}

const framesByAnimalAndMood = new Map<string, readonly SpriteFrame[]>()

export function spriteFrames(animal: Animal, mood: Mood): readonly SpriteFrame[] {
  const cacheKey = `${animal}/${mood}`
  const cached = framesByAnimalAndMood.get(cacheKey)
  if (cached) return cached
  const base = ANIMAL_GRIDS[animal].map(row => row.split(''))
  const palette = { ...SHARED_PALETTE, ...ANIMAL_PALETTES[animal] }
  const tint = mood === 'sick' ? SICK_GREEN : null
  const frames = MOOD_FRAMES[mood](base).map(grid => paintedFrame(grid, palette, tint))
  framesByAnimalAndMood.set(cacheKey, frames)
  return frames
}
