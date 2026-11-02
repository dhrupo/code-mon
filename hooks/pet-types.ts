import type { Animal, Mood } from '../types'

export type { Animal, Mood }

export const ANIMALS = ['cat', 'dog', 'hare', 'fox', 'penguin', 'hamster', 'chick', 'frog', 'panda'] as const satisfies readonly Animal[]

export const MOODS = ['playful', 'happy', 'hungry', 'dizzy', 'sick', 'alert', 'proud', 'sleepy', 'missed-you'] as const satisfies readonly Mood[]
