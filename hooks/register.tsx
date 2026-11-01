import type { Register } from 'claude-code'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'codemon',
      description: 'Open the Code-mon pet pane',
    })

    return next(e)
  })
}
