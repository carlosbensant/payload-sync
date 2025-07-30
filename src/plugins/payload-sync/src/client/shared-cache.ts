'use client'

import { createQueryHash } from '../utilities/query-hash'
import type { PayloadQuery } from '../types'

// Shared cache that both hooks use
const sharedCache = new Map<string, any>()

// Subscribers for cache changes
const cacheSubscribers = new Map<string, Set<(data: any) => void>>()

/**
 * Shared cache for payload-sync data
 * Used by both usePayloadSync (queries) and usePayloadMutation (optimistic updates)
 */
export const payloadCache = {
  /**
   * Get data from cache
   */
  get: (query: PayloadQuery): any => {
    const queryKey = createQueryHash(query)
    return sharedCache.get(queryKey)
  },

  /**
   * Set data in cache and notify subscribers
   */
  set: (query: PayloadQuery, data: any): void => {
    const queryKey = createQueryHash(query)
    console.log('💾 [CACHE] Setting cache with query:', {
      query,
      queryKey,
      dataType: typeof data,
      docsCount: data?.docs?.length,
    })
    sharedCache.set(queryKey, data)

    // Notify all subscribers of this query
    const subscribers = cacheSubscribers.get(queryKey)
    if (subscribers) {
      subscribers.forEach((callback) => {
        try {
          callback(data)
        } catch (error) {
          console.error('Error in cache subscriber:', error)
        }
      })
    }
  },

  /**
   * Subscribe to cache changes for a specific query
   */
  subscribe: (query: PayloadQuery, callback: (data: any) => void): (() => void) => {
    const queryKey = createQueryHash(query)

    if (!cacheSubscribers.has(queryKey)) {
      cacheSubscribers.set(queryKey, new Set())
    }

    const subscribers = cacheSubscribers.get(queryKey)!
    subscribers.add(callback)

    // Return unsubscribe function
    return () => {
      subscribers.delete(callback)
      if (subscribers.size === 0) {
        cacheSubscribers.delete(queryKey)
      }
    }
  },

  /**
   * Remove data from cache
   */
  delete: (query: PayloadQuery): void => {
    const queryKey = createQueryHash(query)
    sharedCache.delete(queryKey)

    // Notify subscribers that data is gone
    const subscribers = cacheSubscribers.get(queryKey)
    if (subscribers) {
      subscribers.forEach((callback) => {
        try {
          callback(undefined)
        } catch (error) {
          console.error('Error in cache subscriber:', error)
        }
      })
    }
  },

  /**
   * Clear all cache data
   */
  clear: (): void => {
    sharedCache.clear()

    // Notify all subscribers
    cacheSubscribers.forEach((subscribers) => {
      subscribers.forEach((callback) => {
        try {
          callback(undefined)
        } catch (error) {
          console.error('Error in cache subscriber:', error)
        }
      })
    })

    cacheSubscribers.clear()
  },

  /**
   * Get all cached query keys (for debugging)
   */
  getKeys: (): string[] => {
    return Array.from(sharedCache.keys())
  },

  /**
   * Get cache size (for debugging)
   */
  size: (): number => {
    return sharedCache.size
  },
}

/**
 * Create an OptimisticLocalStore that integrates with the shared cache
 */
export function createOptimisticLocalStore() {
  return {
    getQuery: (query: PayloadQuery) => {
      return payloadCache.get(query)
    },

    setQuery: (query: PayloadQuery, data: any) => {
      payloadCache.set(query, data)
    },

    invalidateQuery: (query: PayloadQuery) => {
      payloadCache.delete(query)
      // Also trigger re-execution of the query
      // We'll import this dynamically to avoid circular dependency
      import('./payload-sync').then(({ executeQuery }) => {
        executeQuery(query).catch(console.error)
      })
    },
  }
}
