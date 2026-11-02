import type { Register } from 'claude-code'

import { registerPetPane } from './pane'
import { registerTabEvents } from './tab-events'

export const register: Register = on => {
  registerPetPane(on)
  registerTabEvents(on)
}
