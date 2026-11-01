import type { Register } from 'claude-code'

import { registerPetPane } from './pane'

export const register: Register = on => {
  registerPetPane(on)
}
