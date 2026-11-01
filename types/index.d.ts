import type { Pet } from '../hooks/pet'
import type { Animal } from '../hooks/pet-types'

declare global {
  // The engine's runtime has these (TC39 base64); the es2023 lib does not declare them yet.
  interface Uint8Array {
    toBase64(): string
  }
  interface Uint8ArrayConstructor {
    fromBase64(base64: string): Uint8Array<ArrayBuffer>
  }
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
