export type Animal = 'cat' | 'dog' | 'hare' | 'fox' | 'penguin' | 'hamster' | 'chick' | 'frog' | 'panda'
export type Mood = 'playful' | 'happy' | 'hungry' | 'dizzy' | 'sick' | 'alert' | 'proud' | 'sleepy' | 'missed-you'

export type Pet = {
  animal: Animal
  name: string
  adoptedAt: number
  lastTickAt: number
  lastActiveAt: number
  hungerElapsedMs: number
  tempMood?: Mood
  tempMoodUntil?: number
  isNapping: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'code-mon': {
      pet: Shaped<Pet | null>
      pickedAnimal: Animal | null
      bubble: string | null
    }
  }
}
