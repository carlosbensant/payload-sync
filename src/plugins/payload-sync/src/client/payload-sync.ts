'use client'

import { v4 as uuidv4 } from 'uuid'
import type { PayloadQuery, ReadOperation } from '../types'
import { createQueryHash } from '../utilities/query-hash'
import { payloadCache } from './shared-cache'
import { Payload } from 'payload'

export type StringifiedQuery = string

// Generate a unique session ID for this client instance
// This is used as fallback when user is not authenticated
const clientId = uuidv4()

// Store the current client ID globally
let currentClientId: string = clientId

let eventSource: EventSource | null = null

// Active subscriptions for session-based architecture
const activeSubscriptions = new Map<
  string,
  {
    query: PayloadQuery
    callback: (data: any, error: Error | null) => void
  }
>()

// Client-side data cache
const dataCache = new Map<string, any>()

export function createPayloadClient(
  userId: string | null,
  { onConnect }: { onConnect: () => void },
) {
  // Use authenticated user ID if available, otherwise fall back to session ID
  // Update the global client ID
  currentClientId = userId || clientId

  console.log('Payload Query Client initialized with:', {
    clientId: currentClientId,
    isAuthenticated: !!userId,
  })

  const connect = () => {
    if (typeof window === 'undefined' || eventSource) {
      return
    }

    eventSource = new EventSource(`/api/sync?clientId=${currentClientId}`)

    eventSource.onmessage = (event) => {
      try {
        console.log(event, 'onmessage event')

        const data = JSON.parse(event.data)

        // ignore initial connection message
        if (data === 'connected') {
          onConnect()
          return
        }

        console.log(data, 'onmessage - data')
        // const { queryResult } = data as {
        //   queryResult: Awaited<ReturnType<Payload[ReadOperation]>>
        // }

        handleSessionUpdate(data)
      } catch (err) {
        console.error('Error processing server-sent event:', err)
      }
    }

    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error)
      // Add more specific logging
      console.error('Error type:', error.type)
      console.error('Error target:', error.target)
      eventSource?.close()
      eventSource = null
      // Attempt to reconnect after a delay
      setTimeout(connect, 5000)
    }
  }

  return { connect }
}

/**
 * Handle incoming session updates and route them to appropriate subscriptions
 */
function handleSessionUpdate(data: any): void {
  const { type, updates } = data

  if (!updates || !Array.isArray(updates)) {
    console.warn('Invalid session update format:', data)
    return
  }

  switch (type) {
    case 'incremental_updates':
      handleIncrementalUpdates(updates)
      break
    case 'count_updates':
      handleCountUpdates(updates)
      break
    case 'cross_collection_updates':
      handleCrossCollectionUpdates(updates)
      break
    default:
      console.warn('Unknown session update type:', type)
  }
}

/**
 * Handle incremental updates for find/findByID queries
 */
function handleIncrementalUpdates(updates: any[]): void {
  console.log('🔄 [CLIENT] Processing incremental updates:', updates.length)

  for (const update of updates) {
    const { queryKey, changeType, data } = update
    console.log('🔍 [CLIENT] Processing update:', { queryKey, changeType, dataId: data?.id })

    const subscription = activeSubscriptions.get(queryKey)

    if (!subscription) {
      console.log('❌ [CLIENT] No active subscription for queryKey:', queryKey)
      console.log('📋 [CLIENT] Available subscriptions:', Array.from(activeSubscriptions.keys()))
      continue
    }

    console.log('✅ [CLIENT] Found subscription for queryKey:', queryKey)

    try {
      const cachedData = dataCache.get(queryKey)
      console.log(
        '💾 [CLIENT] Cached data exists:',
        !!cachedData,
        'Has docs:',
        cachedData && Array.isArray(cachedData.docs),
      )

      // Determine query type from queryKey (first part before first dot)
      const queryType = queryKey.split('.')[0] // 'find' or 'findByID' or 'count'
      console.log('🔍 [CLIENT] Detected query type:', queryType)

      if (queryType === 'find' && cachedData && Array.isArray(cachedData.docs)) {
        // Handle find queries with document arrays
        let updatedDocs = [...cachedData.docs]
        console.log('📄 [CLIENT] Current docs count:', updatedDocs.length)

        switch (changeType) {
          case 'insert':
            insertDocumentSorted(updatedDocs, data, subscription.query)
            console.log(
              '➕ [CLIENT] Inserted document in sorted position, new count:',
              updatedDocs.length,
            )
            break
          case 'update':
            const updateIndex = updatedDocs.findIndex((doc) => doc.id === data.id)
            if (updateIndex >= 0) {
              updatedDocs[updateIndex] = { ...updatedDocs[updateIndex], ...data }
              console.log('✏️ [CLIENT] Updated document at index:', updateIndex)

              // Check if the update changed sort-relevant fields and re-sort if needed
              if (mightAffectSorting(data, subscription.query)) {
                console.log('🔄 [CLIENT] Update might affect sorting, re-sorting array')
                sortDocumentArray(updatedDocs, subscription.query)
              }
            } else {
              console.log('⚠️ [CLIENT] Document not found for update:', data.id)
            }
            break
          case 'upsert':
            const upsertIndex = updatedDocs.findIndex((doc) => doc.id === data.id)
            if (upsertIndex >= 0) {
              updatedDocs[upsertIndex] = { ...updatedDocs[upsertIndex], ...data }
              console.log('✏️ [CLIENT] Upserted existing document at index:', upsertIndex)

              // Check if the update changed sort-relevant fields and re-sort if needed
              if (mightAffectSorting(data, subscription.query)) {
                console.log('🔄 [CLIENT] Upsert might affect sorting, re-sorting array')
                sortDocumentArray(updatedDocs, subscription.query)
              }
            } else {
              insertDocumentSorted(updatedDocs, data, subscription.query)
              console.log(
                '➕ [CLIENT] Upserted new document in sorted position, new count:',
                updatedDocs.length,
              )
            }
            break
          case 'delete':
            const beforeCount = updatedDocs.length
            updatedDocs = updatedDocs.filter((doc) => doc.id !== data.id)
            console.log(
              '🗑️ [CLIENT] Deleted document, count change:',
              beforeCount,
              '→',
              updatedDocs.length,
            )
            break
        }

        const updatedData = { ...cachedData, docs: updatedDocs }
        dataCache.set(queryKey, updatedData)
        console.log('💾 [CLIENT] Updated cache for queryKey:', queryKey)
        console.log('📞 [CLIENT] Calling subscription callback with updated data')
        subscription.callback(updatedData, null)
      } else if (queryType === 'findByID') {
        // Handle findByID queries
        const result = changeType === 'delete' ? null : data
        dataCache.set(queryKey, result)
        console.log('📞 [CLIENT] Calling findByID callback')
        subscription.callback(result, null)
      } else {
        console.log('⚠️ [CLIENT] Unhandled query type or missing cached data:', {
          queryType,
          hasCachedData: !!cachedData,
        })
      }
    } catch (error) {
      console.error('❌ [CLIENT] Error processing incremental update:', error)
      subscription.callback(null, error instanceof Error ? error : new Error(String(error)))
    }
  }
}

/**
 * Handle count updates
 */
function handleCountUpdates(updates: any[]): void {
  console.log('🔄 [CLIENT] Processing count updates:', updates.length)

  for (const update of updates) {
    const { queryKey, changeType } = update
    console.log('🔍 [CLIENT] Processing count update:', { queryKey, changeType })

    const subscription = activeSubscriptions.get(queryKey)

    if (!subscription) {
      console.log('❌ [CLIENT] No active subscription for count queryKey:', queryKey)
      continue
    }

    if (changeType === 'count_invalidated') {
      // For count invalidation, use the shared cache invalidation mechanism
      console.log('🔄 [CLIENT] Count invalidated for query:', queryKey)

      // Clear the cached data and notify subscribers
      payloadCache.delete(subscription.query)
      dataCache.delete(queryKey)

      // Trigger a refetch to get fresh count
      console.log('📞 [CLIENT] Triggering refetch for invalidated count query')
      executeQuery(subscription.query)
        .then((freshData) => {
          console.log('✅ [CLIENT] Count refetch completed')
          if (freshData) {
            payloadCache.set(subscription.query, freshData)
          }
        })
        .catch((error) => {
          console.error('❌ [CLIENT] Count refetch failed:', error)
          subscription.callback(null, error instanceof Error ? error : new Error(String(error)))
        })
    }
  }
}

/**
 * Handle cross-collection updates
 */
function handleCrossCollectionUpdates(updates: any[]): void {
  console.log('🔄 [CLIENT] Processing cross-collection updates:', updates.length)

  for (const update of updates) {
    const { queryKey, changeType, data } = update
    console.log('🔍 [CLIENT] Processing cross-collection update:', { queryKey, changeType })

    const subscription = activeSubscriptions.get(queryKey)

    if (!subscription) {
      console.log('❌ [CLIENT] No active subscription for cross-collection queryKey:', queryKey)
      continue
    }

    console.log('✅ [CLIENT] Found subscription for cross-collection queryKey:', queryKey)

    try {
      if (changeType === 'invalidate') {
        // For invalidation, use the shared cache invalidation mechanism
        console.log('🔄 [CLIENT] Invalidating query cache for:', queryKey)

        // Clear the cached data and notify subscribers
        // This will automatically trigger a refetch via the cache's invalidateQuery mechanism
        payloadCache.delete(subscription.query)

        // Also clear the local dataCache for consistency
        dataCache.delete(queryKey)

        console.log('✅ [CLIENT] Cache invalidated, refetch will be triggered automatically')
      } else if (changeType === 'targeted' && data) {
        // For targeted updates, we have specific data to update
        console.log('🎯 [CLIENT] Applying targeted cross-collection update')

        const cachedData = dataCache.get(queryKey)
        if (cachedData) {
          // Apply the targeted update to cached data
          // This would need more sophisticated logic based on the update type
          dataCache.set(queryKey, data)
          payloadCache.set(subscription.query, data)
          subscription.callback(data, null)
        } else {
          // No cached data, trigger a refetch
          console.log('📞 [CLIENT] No cached data, triggering refetch for targeted update')
          executeQuery(subscription.query)
            .then((freshData) => {
              if (freshData) {
                payloadCache.set(subscription.query, freshData)
              }
            })
            .catch((error) => {
              console.error('❌ [CLIENT] Targeted update refetch failed:', error)
              subscription.callback(null, error instanceof Error ? error : new Error(String(error)))
            })
        }
      }
    } catch (error) {
      console.error('❌ [CLIENT] Error processing cross-collection update:', error)
      subscription.callback(null, error instanceof Error ? error : new Error(String(error)))
    }
  }
}

/**
 * Execute a query against the server
 */
export async function executeQuery(query: PayloadQuery): Promise<any> {
  if (typeof window === 'undefined') {
    console.log('SSR detected, skipping query execution')
    return null
  }

  try {
    console.log('🚀 [CLIENT] Executing query:', query)

    const response = await fetch('/api/query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...query,
        clientId: currentClientId,
      }),
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const result = await response.json()
    console.log('📥 [CLIENT] Query response received:', result)

    // Cache the data using the same hash key that subscriptions use
    const hashKey = createQueryHash(query)
    dataCache.set(hashKey, result.data)
    console.log('💾 [CLIENT] Cached query result with key:', hashKey)
    console.log('📊 [CLIENT] Cache now has keys:', Array.from(dataCache.keys()))

    return result.data
  } catch (error) {
    console.error('Error executing query:', error)
    throw error
  }
}

/**
 * Subscribe to real-time updates for a query
 */
export function subscribeToQuery(
  query: PayloadQuery,
  callback: (data: any, error: Error | null) => void,
): void {
  const hashKey = createQueryHash(query)
  console.log('📡 [CLIENT] Subscribing to query with key:', hashKey)
  console.log('🔍 [CLIENT] Query details:', query)

  // Store subscription in our local map
  activeSubscriptions.set(hashKey, {
    query,
    callback,
  })

  console.log('✅ [CLIENT] Subscription registered. Total subscriptions:', activeSubscriptions.size)
  console.log('📋 [CLIENT] All subscription keys:', Array.from(activeSubscriptions.keys()))
}

/**
 * Unsubscribe from real-time updates for a query
 */
export function unsubscribeFromQuery(query: PayloadQuery): void {
  const hashKey = createQueryHash(query)
  activeSubscriptions.delete(hashKey)
  console.log('Unsubscribed from query:', hashKey)
}

/**
 * Get current client/session ID
 */
export function getCurrentClientId(): string {
  return currentClientId
}

/**
 * Get current session ID
 */
export function getCurrentSessionId(): string {
  return clientId
}

/**
 * Insert a document into an array while maintaining sort order
 */
function insertDocumentSorted(docs: any[], newDoc: any, query: PayloadQuery): void {
  const sort = (query as any).sort
  if (!sort || docs.length === 0) {
    // No sort specified or empty array, just append
    docs.push(newDoc)
    return
  }

  const insertIndex = findSortedInsertPosition(docs, newDoc, sort)
  docs.splice(insertIndex, 0, newDoc)
}

/**
 * Find the correct position to insert a document to maintain sort order
 */
function findSortedInsertPosition(docs: any[], newDoc: any, sort: string): number {
  if (docs.length === 0) return 0

  // Parse sort string (e.g., "-createdAt" or "name")
  const isDescending = sort.startsWith('-')
  const sortField = isDescending ? sort.slice(1) : sort

  // Binary search for the correct position
  let left = 0
  let right = docs.length

  while (left < right) {
    const mid = Math.floor((left + right) / 2)
    const comparison = compareDocuments(docs[mid], newDoc, sortField, isDescending)

    if (comparison < 0) {
      left = mid + 1
    } else {
      right = mid
    }
  }

  return left
}

/**
 * Compare two documents based on a field and sort direction
 */
function compareDocuments(docA: any, docB: any, field: string, descending: boolean): number {
  const valueA = getNestedValue(docA, field)
  const valueB = getNestedValue(docB, field)

  let comparison = 0

  if (valueA < valueB) {
    comparison = -1
  } else if (valueA > valueB) {
    comparison = 1
  }

  return descending ? -comparison : comparison
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : undefined
  }, obj)
}

/**
 * Sort an entire document array based on query sort order
 */
function sortDocumentArray(docs: any[], query: PayloadQuery): void {
  const sort = (query as any).sort
  if (!sort) return

  const isDescending = sort.startsWith('-')
  const sortField = isDescending ? sort.slice(1) : sort

  docs.sort((a, b) => compareDocuments(a, b, sortField, isDescending))
}

/**
 * Check if an update might affect the sorting order
 */
function mightAffectSorting(updatedDoc: any, query: PayloadQuery): boolean {
  const sort = (query as any).sort
  if (!sort) return false

  const sortField = sort.startsWith('-') ? sort.slice(1) : sort

  // Check if the updated document contains the sort field
  return Object.prototype.hasOwnProperty.call(updatedDoc, sortField)
}
