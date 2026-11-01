export const ANIMALS = ['cat', 'dog', 'hare', 'fox', 'penguin', 'hamster', 'chick', 'frog', 'panda'] as const
export type Animal = (typeof ANIMALS)[number]

export const MOODS = ['playful', 'happy', 'hungry', 'dizzy', 'sick', 'alert', 'proud', 'sleepy', 'missed-you'] as const
export type Mood = (typeof MOODS)[number]
