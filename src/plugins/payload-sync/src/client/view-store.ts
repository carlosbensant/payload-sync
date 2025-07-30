import { PayloadViewWrapper, DEFAULT_TTL, type TTL } from './view-wrapper'
import { createQueryHash } from '../utilities/query-hash'
import { executeQuery, subscribeToQuery, unsubscribeFromQuery } from './payload-sync'
import { payloadCache } from './shared-cache'
import type { PayloadQuery } from '../types'

/**
 * Global store for all active views.
 * Handles deduplication, reference counting, and lifecycle management.
 * Inspired by Zero Sync's ViewStore architecture.
 */
export class PayloadViewStore {
  #views = new Map<string, PayloadViewWrapper>()
  #cacheUnsubscribers = new Map<string, () => void>()

  /**
   * Get or create a view for the given query.
   * Multiple calls with the same query will return the same view instance.
   */
  getView<T = any>(
    query: PayloadQuery,
    enabled: boolean = true,
    ttl: TTL = DEFAULT_TTL,
  ): PayloadViewWrapper<T> {
    if (!enabled) {
      // Return a disabled view that doesn't subscribe to anything
      return this.#createDisabledView<T>(query)
    }

    const hash = createQueryHash(query)
    const existingView = this.#views.get(hash) as PayloadViewWrapper<T> | undefined

    if (existingView) {
      // Update TTL if needed
      existingView.updateTTL(ttl)
      return existingView
    }

    // Create new view
    const view = new PayloadViewWrapper<T>(
      query,
      ttl,
      (wrapper) => this.#onViewMaterialized(hash, wrapper),
      () => this.#onViewDematerialized(hash),
    )

    this.#views.set(hash, view)
    return view
  }

  /**
   * Get all active views (for debugging)
   */
  getAllViews(): PayloadViewWrapper[] {
    return Array.from(this.#views.values())
  }

  /**
   * Get view count (for debugging)
   */
  getViewCount(): number {
    return this.#views.size
  }

  /**
   * Handle view materialization (start server subscription)
   */
  #onViewMaterialized = async (hash: string, wrapper: PayloadViewWrapper) => {
    console.log('View materialized:', hash)
    console.log('Wrapper query:', wrapper.query)

    try {
      // Check shared cache first for optimistic updates
      const cachedData = payloadCache.get(wrapper.query)
      if (cachedData) {
        console.log('Found cached data, using it:', { hasData: !!cachedData })
        wrapper.updateData(cachedData, null, 'complete')
      }

      // Execute initial query to get baseline data
      console.log('About to execute query:', wrapper.query)
      const initialData = await executeQuery(wrapper.query)

      // Handle SSR case where executeQuery returns null
      if (initialData === null && typeof window === 'undefined') {
        console.log('SSR detected, skipping initial data load')
        // Don't update data, let the client-side hydration handle it
        return
      }

      console.log('Received initial data:', {
        hasData: !!initialData,
        type: typeof initialData,
        keys: initialData ? Object.keys(initialData) : 'no data',
      })

      // Update both the view and shared cache
      console.log('Calling wrapper.updateData with:', { initialData })
      wrapper.updateData(initialData, null, 'complete')
      if (initialData) {
        payloadCache.set(wrapper.query, initialData)
      }
      console.log('Called wrapper.updateData - should be complete now')

      // Subscribe to shared cache changes (for optimistic updates from mutations)
      const unsubscribeFromCache = payloadCache.subscribe(wrapper.query, (data) => {
        if (data !== undefined) {
          console.log('Shared cache update received:', { hasData: !!data })
          wrapper.updateData(data, null, 'complete')
        } else {
          // Cache was invalidated - trigger refetch
          console.log('Cache invalidated, triggering refetch for query:', wrapper.query)
          executeQuery(wrapper.query)
            .then((freshData) => {
              console.log('Refetch completed after cache invalidation')
              if (freshData) {
                wrapper.updateData(freshData, null, 'complete')
                payloadCache.set(wrapper.query, freshData)
              }
            })
            .catch((error) => {
              console.error('Refetch failed after cache invalidation:', error)
              wrapper.updateError(error instanceof Error ? error : new Error(String(error)))
            })
        }
      })

      // Store unsubscribe function for cleanup
      this.#cacheUnsubscribers.set(hash, unsubscribeFromCache)

      // Subscribe to real-time updates
      subscribeToQuery(wrapper.query, (data: any, error: any) => {
        console.log('Real-time update received:', { hasData: !!data, error })
        if (error) {
          wrapper.updateError(error)
        } else {
          wrapper.updateData(data, null, 'complete')
          // Also update shared cache with server data
          if (data) {
            payloadCache.set(wrapper.query, data)
          }
        }
      })
    } catch (error) {
      console.error('Error materializing view:', error)
      wrapper.updateError(error instanceof Error ? error : new Error(String(error)))
    }
  }

  /**
   * Handle view dematerialization (cleanup server subscription)
   */
  #onViewDematerialized = (hash: string) => {
    console.log('View dematerialized:', hash)

    const view = this.#views.get(hash)
    if (view) {
      // Unsubscribe from server updates
      unsubscribeFromQuery(view.query)

      // Unsubscribe from shared cache updates
      const cacheUnsubscriber = this.#cacheUnsubscribers.get(hash)
      if (cacheUnsubscriber) {
        cacheUnsubscriber()
        this.#cacheUnsubscribers.delete(hash)
      }

      // Remove from store
      this.#views.delete(hash)
    }
  }

  /**
   * Create a disabled view that doesn't subscribe to anything
   */
  #createDisabledView<T>(query: PayloadQuery): PayloadViewWrapper<T> {
    return new PayloadViewWrapper<T>(
      query,
      0, // No TTL for disabled views
      () => {}, // No materialization
      () => {}, // No dematerialization
    )
  }
}

// Global singleton instance
export const payloadViewStore = new PayloadViewStore()

// Export for testing
export function getViewStoreForTesting(): PayloadViewStore {
  return payloadViewStore
}
