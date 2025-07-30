// Main React hook
export { usePayloadQuery } from './use-payload-sync'
export type { UsePayloadQueryOptions, UsePayloadQueryResult } from './use-payload-sync'

// Provider component
export { PayloadQueryProvider } from './payload-sync-provider'

// Types
export type { TTL, QuerySnapshot, QueryResult } from './view-wrapper'

// View store (for debugging/testing)
export { payloadViewStore, getViewStoreForTesting } from './view-store'

// Low-level client functions (advanced usage)
export {
  createPayloadClient,
  executeQuery,
  subscribeToQuery,
  unsubscribeFromQuery,
  getCurrentClientId,
  getCurrentSessionId,
} from './payload-sync'

// Mutation hooks and helpers
export { usePayloadMutation } from './use-payload-mutation'
export {
  createMutationFn,
  updateMutationFn,
  deleteMutationFn,
  optimisticCreateUpdate,
  optimisticUpdateUpdate,
  optimisticDeleteUpdate,
} from './mutation-helpers'

// Shared cache (for advanced usage)
export { payloadCache } from './shared-cache'
