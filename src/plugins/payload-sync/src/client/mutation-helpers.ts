'use client'

import { getCurrentClientId } from './payload-sync'

// Mutation helper functions for payload-sync

/**
 * Helper function to create a mutation function for creating documents
 */
export function createMutationFn<T extends Record<string, any> = Record<string, any>>(
  collection: string,
) {
  const clientId = getCurrentClientId()

  return async (data: T): Promise<T> => {
    const response = await fetch('/api/query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'create',
        collection,
        clientId,
        data,
      }),
    })

    if (!response.ok) {
      throw new Error(`Failed to create ${collection}: ${response.statusText}`)
    }

    return response.json()
  }
}

/**
 * Helper function to create a mutation function for updating documents
 */
export function updateMutationFn<T = any>(collection: string) {
  const clientId = getCurrentClientId()

  return async ({ id, data }: { id: string; data: Partial<T> }): Promise<T> => {
    const response = await fetch('/api/query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'update',
        collection,
        clientId,
        id,
        data,
      }),
    })

    if (!response.ok) {
      throw new Error(`Failed to update ${collection}: ${response.statusText}`)
    }

    return response.json()
  }
}

/**
 * Helper function to create a mutation function for deleting documents
 */
export function deleteMutationFn(collection: string) {
  const clientId = getCurrentClientId()

  return async (id: string): Promise<{ id: string }> => {
    const response = await fetch('/api/query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'delete',
        collection,
        clientId,
        id,
      }),
    })

    if (!response.ok) {
      throw new Error(`Failed to delete ${collection}: ${response.statusText}`)
    }

    return response.json()
  }
}

/**
 * Optimistic update helper for find queries
 * Adds a new item to the beginning of a paginated result
 */
export function optimisticCreateUpdate<T>(query: {
  type: 'find'
  collection: string
  where?: any
  sort?: string
  limit?: number
  populate?: any
}) {
  return (localStore: any, newItem: T & { id: string }) => {
    const existingData = localStore.getQuery(query)

    if (existingData?.docs) {
      localStore.setQuery(query, {
        ...existingData,
        docs: [newItem, ...existingData.docs],
        totalDocs: existingData.totalDocs + 1,
      })
    }

    // Also update count queries
    const countData = localStore.getQuery({
      type: 'count',
      collection: query.collection,
      where: query.where,
    })

    if (countData) {
      localStore.setQuery(
        {
          type: 'count',
          collection: query.collection,
          where: query.where,
        },
        {
          totalDocs: countData.totalDocs + 1,
        },
      )
    }
  }
}

/**
 * Optimistic update helper for update mutations
 * Updates an existing item in paginated results
 */
export function optimisticUpdateUpdate<T>(query: {
  type: 'find'
  collection: string
  where?: any
  sort?: string
  limit?: number
  populate?: any
}) {
  return (localStore: any, { id, data }: { id: string; data: Partial<T> }) => {
    console.log('🔄 [OPTIMISTIC] Applying optimistic update for:', {
      id,
      data,
      query,
    })

    const existingData = localStore.getQuery(query)

    console.log('🔄 [OPTIMISTIC] Existing data:', existingData)

    if (existingData?.docs) {
      const updatedDocs = existingData.docs.map((doc: any) =>
        doc.id === id ? { ...doc, ...data } : doc,
      )

      console.log('🔄 [OPTIMISTIC] Updated docs:', updatedDocs)

      localStore.setQuery(query, {
        ...existingData,
        docs: updatedDocs,
      })

      console.log('🔄 [OPTIMISTIC] Cache updated successfully')
    } else {
      console.log('🔄 [OPTIMISTIC] No existing data found in cache')
    }

    // Also update findByID queries
    const singleData = localStore.getQuery({
      type: 'findByID',
      collection: query.collection,
      id,
    })

    if (singleData) {
      localStore.setQuery(
        {
          type: 'findByID',
          collection: query.collection,
          id,
        },
        {
          ...singleData,
          ...data,
        },
      )
    }
  }
}

/**
 * Optimistic update helper for delete mutations
 * Removes an item from paginated results
 */
export function optimisticDeleteUpdate(query: {
  type: 'find'
  collection: string
  where?: any
  sort?: string
  limit?: number
  populate?: any
}) {
  return (localStore: any, id: string) => {
    const existingData = localStore.getQuery(query)

    if (existingData?.docs) {
      const filteredDocs = existingData.docs.filter((doc: any) => doc.id !== id)

      localStore.setQuery(query, {
        ...existingData,
        docs: filteredDocs,
        totalDocs: existingData.totalDocs - 1,
      })
    }

    // Also update count queries
    const countData = localStore.getQuery({
      type: 'count',
      collection: query.collection,
      where: query.where,
    })

    if (countData) {
      localStore.setQuery(
        {
          type: 'count',
          collection: query.collection,
          where: query.where,
        },
        {
          totalDocs: countData.totalDocs - 1,
        },
      )
    }

    // Remove findByID queries
    localStore.invalidateQuery({
      type: 'findByID',
      collection: query.collection,
      id,
    })
  }
}
