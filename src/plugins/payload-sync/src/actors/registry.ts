import { setup } from '@rivetkit/actor'

import { subscriptions } from './subscriptions'

// Register actors for use: https://rivet.gg/docs/setup
export const registry = setup({
  use: { subscriptions },
})
