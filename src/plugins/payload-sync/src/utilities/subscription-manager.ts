import { registerQueryDependencies, unregisterQueryDependencies } from './dependency-tracker'
import { getSubscriptions } from './endpoints'
import { SessionSubscription } from '../actors/subscriptions'

/**
 * Register a session and its first query subscription
 */
export async function registerSession(
  clientId: string,
  queryKey: string,
  collection: string,
  queryType: 'find' | 'findByID' | 'count',
  params: {
    where?: any
    sort?: string
    limit?: number
    populate?: any
  },
): Promise<void> {
  const subscriptions = getSubscriptions()
  let session = await subscriptions.getSession(clientId)
  // let session = activeSessions.get(clientId)

  if (!session) {
    session = {
      clientId,
      queries: [],
      lastActivity: new Date(),
    }
    await subscriptions.addSession(clientId, session)
    console.log(`📝 [SESSION] Created new session: ${clientId}`)
  }

  // Add query to session
  await subscriptions.addQueryToSession(clientId, {
    queryKey,
    collection,
    queryType,
    params,
    lastSyncTime: new Date(),
  })

  // Register dependencies for tracking
  registerQueryDependencies({
    queryKey,
    collection,
    params,
  })

  console.log(`📝 [SESSION] Added query ${queryKey} to session ${clientId}`)
}

/**
 * Add a query to an existing session
 */
export async function addQueryToSession(
  clientId: string,
  queryKey: string,
  collection: string,
  queryType: 'find' | 'findByID' | 'count',
  params: {
    where?: any
    sort?: string
    limit?: number
    populate?: any
  },
): Promise<void> {
  const subscriptions = getSubscriptions()
  const session = await subscriptions.getSession(clientId)

  if (!session) {
    console.warn(`[SESSION] Session ${clientId} not found, cannot add query`)
    return
  }

  await subscriptions.addQueryToSession(clientId, {
    queryKey,
    collection,
    queryType,
    params,
    lastSyncTime: new Date(),
  })

  // Register dependencies for tracking
  await registerQueryDependencies({
    queryKey,
    collection,
    params,
  })

  console.log(`📝 [SESSION] Added query ${queryKey} to session ${clientId}`)
}

/**
 * Remove a session and all its queries
 */
export async function removeSession(clientId: string): Promise<void> {
  const subscriptions = getSubscriptions()
  const session = await subscriptions.getSession(clientId)

  if (!session) {
    return
  }

  // Unregister all query dependencies
  for (const [queryKey] of session.queries) {
    unregisterQueryDependencies(queryKey)
  }

  await subscriptions.deleteSession(clientId)
  console.log(`📝 [SESSION] Removed session: ${clientId}`)
}

/**
 * Get all sessions that have queries for a specific collection
 */
export async function getSessionsForCollection(collection: string): Promise<SessionSubscription[]> {
  const sessions: SessionSubscription[] = []
  const subscriptions = getSubscriptions()
  const activeSessions = await subscriptions.getSessions()

  for (const { session } of activeSessions) {
    const hasCollectionQuery = session.queries.some(
      (query: { collection: string }) => query.collection === collection,
    )

    if (hasCollectionQuery) {
      sessions.push(session)
    }
  }

  return sessions
}

/**
 * Get all sessions that have a specific query
 */
export async function getSessionsForQuery(queryKey: string): Promise<SessionSubscription[]> {
  const sessions: SessionSubscription[] = []
  const subscriptions = getSubscriptions()
  const activeSessions = await subscriptions.getSessions()

  for (const { session } of activeSessions) {
    if (session.queries.some((query: { queryKey: string }) => query.queryKey === queryKey)) {
      sessions.push(session)
    }
  }

  return sessions
}

/**
 * Get all active sessions
 */
export async function getAllSessions(): Promise<SessionSubscription[]> {
  const subscriptions = getSubscriptions()
  const activeSessions = await subscriptions.getSessions()
  return activeSessions.map(({ session }: { session: SessionSubscription }) => session)
}

/**
 * Clean up old sessions (should be called periodically)
 */
export function cleanupOldSessions(maxAgeMinutes: number = 60): void {
  const subscriptions = getSubscriptions()
  subscriptions.cleanupOldSessions(maxAgeMinutes)
}

// Legacy functions for backward compatibility
export async function subscribeToQuery(
  clientId: string,
  queryKey: string,
  collection: string,
  params: {
    where?: any
    sort?: string
    limit?: number
    populate?: any
  },
): Promise<void> {
  // Extract session ID from user context or generate one
  const subscriptions = getSubscriptions()
  const session = await subscriptions.getSession(clientId)

  // Ensure session exists, then add query
  if (!session) {
    await registerSession(clientId, queryKey, collection, 'find', params)
  } else {
    await addQueryToSession(clientId, queryKey, collection, 'find', params)
  }
}

export async function subscribeToCount(
  clientId: string,
  queryKey: string,
  collection: string,
  params: {
    where?: any
    locale?: string
  },
): Promise<void> {
  await registerSession(clientId, queryKey, collection, 'count', params)
}
