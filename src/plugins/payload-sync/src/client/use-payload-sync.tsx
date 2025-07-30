'use client'

import { useSyncExternalStore } from 'react'
import type { PayloadQuery } from '../types'
import { payloadViewStore } from './view-store'
import { DEFAULT_TTL, type TTL, type QuerySnapshot } from './view-wrapper'
import { getCurrentClientId } from './payload-sync'

export interface UsePayloadQueryOptions {
  /**
   * Whether the query is enabled. If false, the query will not execute.
   * Default: true
   */
  enabled?: boolean

  /**
   * Time to live (TTL) in milliseconds. Controls how long query results are cached
   * after the query is removed. During this time, the system continues to sync the query.
   * Default: 30000 (30 seconds)
   */
  ttl?: TTL
}

export interface UsePayloadQueryResult<T = any> {
  /**
   * The query result data, or undefined if loading/error
   */
  data: T | undefined

  /**
   * Error object if the query failed
   */
  error: Error | null

  /**
   * Whether the query is currently loading
   */
  isLoading: boolean

  /**
   * Whether the query has completed successfully
   */
  isSuccess: boolean

  /**
   * Whether the query has failed
   */
  isError: boolean

  /**
   * The result type: 'unknown' (loading), 'complete' (success), or 'error' (failed)
   */
  type: 'unknown' | 'complete' | 'error'

  /**
   * Timestamp of when this snapshot was created
   */
  timestamp: number
}

/**
 * Advanced React hook for real-time Payload CMS queries with sophisticated caching,
 * deduplication, and lifecycle management.
 *
 * Features:
 * - Automatic deduplication (same query = single server subscription)
 * - Reference counting with TTL
 * - Immutable snapshots prevent unnecessary re-renders
 * - Real-time incremental updates with timestamp-based optimization
 * - Proper cleanup and resource management
 * - Full TypeScript support
 *
 * @example
 * ```tsx
 * function TaskList() {
 *   const { data, isLoading, error } = usePayloadQuery({
 *     type: 'find',
 *     collection: 'tasks',
 *     where: { completed: false },
 *     sort: '-createdAt',
 *     limit: 10
 *   })
 *
 *   if (isLoading) return <div>Loading...</div>
 *   if (error) return <div>Error: {error.message}</div>
 *
 *   return (
 *     <div>
 *       {data?.docs?.map(task => (
 *         <div key={task.id}>{task.title}</div>
 *       ))}
 *       <p>Total: {data?.totalDocs}</p>
 *     </div>
 *   )
 * }
 *
 * function TaskCount() {
 *   const { data, isLoading } = usePayloadQuery({
 *     type: 'count',
 *     collection: 'tasks',
 *     where: { completed: false }
 *   })
 *
 *   if (isLoading) return <div>Loading...</div>
 *   return <div>Active tasks: {data?.totalDocs}</div>
 * }
 * ```
 */
export function usePayloadQuery<T = any>(
  query: PayloadQuery,
  options: UsePayloadQueryOptions = {},
): UsePayloadQueryResult<T> {
  const { enabled = true, ttl = DEFAULT_TTL } = options

  console.log('usePayloadQuery called with query:', query)
  console.log('usePayloadQuery query.type:', query.type)

  const clientId = getCurrentClientId()
  query.clientId = clientId
  // Get or create view from store
  const view = payloadViewStore.getView<T>(query, enabled, ttl)

  // Use React's useSyncExternalStore for optimal performance
  const snapshot: QuerySnapshot<T> = useSyncExternalStore(
    (callback) => {
      console.log('useSyncExternalStore: subscribing with callback')
      const unsubscribe = view.subscribe(callback)
      console.log('useSyncExternalStore: subscribed, got unsubscribe function')
      return unsubscribe
    },
    () => {
      const currentSnapshot = view.getSnapshot()
      console.log('useSyncExternalStore: getSnapshot called, returning:', {
        type: currentSnapshot.result.type,
        hasData: !!currentSnapshot.result.data,
        error: !!currentSnapshot.result.error,
      })
      return currentSnapshot
    },
    () => {
      const currentSnapshot = view.getSnapshot()
      console.log('useSyncExternalStore: getServerSnapshot called, returning:', {
        type: currentSnapshot.result.type,
        hasData: !!currentSnapshot.result.data,
        error: !!currentSnapshot.result.error,
      })
      return currentSnapshot
    },
  )

  console.log('usePayloadQuery render - current snapshot:', {
    type: snapshot.result.type,
    hasData: !!snapshot.result.data,
    error: !!snapshot.result.error,
  })

  // Transform snapshot into user-friendly result
  return {
    data: snapshot.result.data,
    error: snapshot.result.error,
    isLoading: snapshot.result.type === 'unknown',
    isSuccess: snapshot.result.type === 'complete',
    isError: snapshot.result.type === 'error',
    type: snapshot.result.type,
    timestamp: snapshot.timestamp,
  }
}
