import type { PayloadQuery } from '../types'

export type ResultType = 'unknown' | 'complete' | 'error'

export interface QueryResult<T = any> {
  data: T | undefined
  error: Error | null
  type: ResultType
}

export interface QuerySnapshot<T = any> {
  result: QueryResult<T>
  timestamp: number
}

export type TTL = number // milliseconds

export const DEFAULT_TTL = 30_000 // 30 seconds

// Predefined immutable snapshots to prevent unnecessary re-renders
const EMPTY_ARRAY = Object.freeze([])
const LOADING_SNAPSHOT = Object.freeze({
  result: { data: undefined, error: null, type: 'unknown' as const },
  timestamp: 0,
})
const ERROR_SNAPSHOT = Object.freeze({
  result: { data: undefined, error: null, type: 'error' as const },
  timestamp: 0,
})

/**
 * Creates optimized snapshots, reusing immutable objects when possible
 */
function createSnapshot<T>(
  data: T | undefined,
  error: Error | null,
  type: ResultType,
): QuerySnapshot<T> {
  console.log('createSnapshot called with:', {
    hasData: !!data,
    error: !!error,
    type,
    dataType: typeof data,
  })

  // Reuse predefined snapshots for common cases
  if (type === 'unknown' && data === undefined && error === null) {
    console.log('Returning LOADING_SNAPSHOT')
    return LOADING_SNAPSHOT as QuerySnapshot<T>
  }

  if (type === 'error' && data === undefined) {
    console.log('Returning error snapshot')
    return {
      result: { data: undefined, error, type: 'error' },
      timestamp: Date.now(),
    }
  }

  // For arrays, reuse empty array when possible
  if (Array.isArray(data) && data.length === 0) {
    console.log('Returning empty array snapshot')
    const result = {
      data: EMPTY_ARRAY as T,
      error,
      type,
    }
    return {
      result: Object.freeze(result),
      timestamp: Date.now(),
    }
  }

  // Create new frozen snapshot
  console.log('Creating new snapshot with type:', type)
  const result = Object.freeze({ data, error, type })
  const snapshot = {
    result,
    timestamp: Date.now(),
  }
  console.log('Created snapshot:', { resultType: snapshot.result.type })
  return snapshot
}

/**
 * Sophisticated view wrapper with reference counting, TTL, and lifecycle management.
 * Inspired by Zero Sync's ViewWrapper but adapted for Payload CMS.
 */
export class PayloadViewWrapper<T = any> {
  #query: PayloadQuery
  #snapshot: QuerySnapshot<T>
  #subscribers = new Set<() => void>()
  #ttl: TTL
  #cleanupTimer: NodeJS.Timeout | null = null
  #isDestroyed = false

  // Lifecycle callbacks
  #onMaterialized: (wrapper: PayloadViewWrapper<T>) => void
  #onDematerialized: () => void

  // Server subscription management
  #serverSubscriptionActive = false
  #initialDataFetched = false

  constructor(
    query: PayloadQuery,
    ttl: TTL,
    onMaterialized: (wrapper: PayloadViewWrapper<T>) => void,
    onDematerialized: () => void,
  ) {
    this.#query = query
    this.#ttl = ttl
    this.#onMaterialized = onMaterialized
    this.#onDematerialized = onDematerialized
    this.#snapshot = createSnapshot<T>(undefined, null, 'unknown')

    // Materialize immediately
    this.#materialize()
  }

  /**
   * Subscribe to this view. Returns unsubscribe function.
   * Compatible with React's `useSyncExternalStore`.
   */
  subscribe = (callback: () => void): (() => void) => {
    if (this.#isDestroyed) {
      throw new Error('Cannot subscribe to destroyed view')
    }

    this.#subscribers.add(callback)
    this.#cancelCleanup()

    return () => {
      this.#subscribers.delete(callback)
      this.#scheduleCleanupIfNeeded()
    }
  }

  /**
   * Get current snapshot. Compatible with React's `useSyncExternalStore`.
   */
  getSnapshot = (): QuerySnapshot<T> => {
    return this.#snapshot
  }

  /**
   * Update the data from server events
   */
  updateData = (data: T | undefined, error: Error | null = null, type: ResultType = 'complete') => {
    if (this.#isDestroyed) return

    console.log('updateData called with:', {
      data: data ? 'DATA_RECEIVED' : 'NO_DATA',
      error,
      type,
      hasData: !!data,
    })

    this.#snapshot = createSnapshot(data, error, type)
    this.#initialDataFetched = true

    console.log('Updated snapshot:', {
      resultType: this.#snapshot.result.type,
      hasData: !!this.#snapshot.result.data,
      error: this.#snapshot.result.error,
    })

    // Notify all subscribers
    console.log('Notifying subscribers, count:', this.#subscribers.size)
    for (const callback of this.#subscribers) {
      console.log('Calling subscriber callback')
      callback()
    }
    console.log('All subscribers notified')
  }

  /**
   * Update error state
   */
  updateError = (error: Error) => {
    this.updateData(undefined, error, 'error')
  }

  /**
   * Update TTL for this view
   */
  updateTTL = (ttl: TTL) => {
    this.#ttl = ttl
  }

  /**
   * Get query information
   */
  get query(): PayloadQuery {
    return this.#query
  }

  get hasSubscribers(): boolean {
    return this.#subscribers.size > 0
  }

  get isInitialDataFetched(): boolean {
    return this.#initialDataFetched
  }

  /**
   * Destroy this view and clean up resources
   */
  destroy = () => {
    if (this.#isDestroyed) return

    this.#isDestroyed = true
    this.#subscribers.clear()
    this.#cancelCleanup()

    if (this.#serverSubscriptionActive) {
      this.#serverSubscriptionActive = false
      // Server-side cleanup will be handled by the view store
    }

    this.#onDematerialized()
  }

  /**
   * Materialize the view (start server subscription)
   */
  #materialize = () => {
    if (this.#serverSubscriptionActive || this.#isDestroyed) return

    console.log('Materializing view for query:', this.#query)
    this.#serverSubscriptionActive = true
    this.#onMaterialized(this)
  }

  /**
   * Schedule cleanup if no subscribers remain
   */
  #scheduleCleanupIfNeeded = () => {
    if (this.#subscribers.size === 0 && !this.#cleanupTimer) {
      this.#cleanupTimer = setTimeout(() => {
        // Double-check that no subscribers were added during TTL
        if (this.#subscribers.size === 0) {
          this.destroy()
        }
      }, this.#ttl)
    }
  }

  /**
   * Cancel scheduled cleanup
   */
  #cancelCleanup = () => {
    if (this.#cleanupTimer) {
      clearTimeout(this.#cleanupTimer)
      this.#cleanupTimer = null
    }
  }
}
