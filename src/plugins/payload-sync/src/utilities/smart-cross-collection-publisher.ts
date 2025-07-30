import type { PayloadRequest } from 'payload'
import { getQueriesDependingOn } from './dependency-tracker'
import { getSessionsForQuery } from './subscription-manager'
import { clients, getSubscriptions } from './endpoints'

/**
 * Smart cross-collection publisher that uses schema-driven dependencies
 * to find exactly which queries need updates when a document changes
 */
export async function publishCrossCollectionUpdates({
  collection: changedCollection,
  docId: documentId,
  doc: document,
  originalDoc,
  operation: operationType,
  req,
}: {
  collection: string
  docId: string
  doc: any
  originalDoc: any
  operation: 'create' | 'update' | 'delete'
  req: PayloadRequest
}): Promise<void> {
  console.log(
    `[SMART-CROSS-COLLECTION] Processing ${operationType} on ${changedCollection}:${documentId}`,
  )

  // Step 1: Find all queries that depend on this collection
  const dependentQueryKeys = await getQueriesDependingOn(changedCollection)

  if (dependentQueryKeys.length === 0) {
    console.log(`[SMART-CROSS-COLLECTION] No queries depend on ${changedCollection}, skipping`)
    return
  }

  console.log(`[SMART-CROSS-COLLECTION] Found ${dependentQueryKeys.length} dependent queries`)

  // Step 2: For each dependent query, check if this specific document affects it
  const affectedUpdates: Array<{
    clientId: string
    queryKey: string
    changeType: 'insert' | 'update' | 'delete' | 'upsert' | 'invalidate'
    data?: any
  }> = []

  for (const queryKey of dependentQueryKeys) {
    const sessions = await getSessionsForQuery(queryKey)

    for (const session of sessions) {
      const query = session.queries.find((q) => q.queryKey === queryKey)
      if (!query) continue

      // Enhanced query matching logic - determines precise change type
      const changeResult = await determineQueryChangeType(
        query,
        changedCollection,
        documentId,
        document,
        originalDoc,
        operationType,
        req,
      )

      if (changeResult.changeType) {
        console.log(
          `[SMART-CROSS-COLLECTION] Query ${queryKey} in session ${session.clientId} affected with changeType: ${changeResult.changeType}`,
        )

        affectedUpdates.push({
          clientId: session.clientId,
          queryKey,
          changeType: changeResult.changeType,
          data: changeResult.data,
        })
      }
    }
  }

  // Step 3: Send targeted updates to affected sessions
  if (affectedUpdates.length > 0) {
    await sendCrossCollectionUpdates(affectedUpdates, changedCollection, operationType)
  } else {
    console.log(`[SMART-CROSS-COLLECTION] No queries actually affected by this change`)
  }
}

/**
 * Enhanced query change type determination with proper document matching
 * This brings back the sophisticated logic from incremental-publisher that handles
 * documents moving in/out of query scope
 */
async function determineQueryChangeType(
  query: {
    queryKey: string
    collection: string
    queryType: 'find' | 'findByID' | 'count'
    params: {
      where?: any
      sort?: string
      limit?: number
      populate?: any
    }
  },
  changedCollection: string,
  documentId: string,
  document: any,
  originalDoc: any,
  operationType: 'create' | 'update' | 'delete',
  req: PayloadRequest,
): Promise<{
  changeType: 'insert' | 'update' | 'delete' | 'upsert' | 'invalidate' | null
  data?: any
}> {
  // For cross-collection updates, we need to check if the changed document
  // affects any documents that would be returned by this query

  // Case 1: Direct collection match with relationship populate
  if (query.collection !== changedCollection && query.params.populate) {
    const populateAffected = await checkPopulateAffected({
      query,
      changedCollection,
      documentId,
      document,
      originalDoc,
      operationType,
      req,
    })

    if (populateAffected) {
      // For populate changes, we invalidate the query to trigger a refetch
      // This ensures populated data is fresh
      return { changeType: 'invalidate' }
    }
  }

  // Case 2: Where clause filters on the changed collection
  if (query.collection !== changedCollection && query.params.where) {
    const whereAffected = checkWhereClauseAffected(
      query.params.where,
      changedCollection,
      documentId,
      document,
      originalDoc,
    )

    if (whereAffected) {
      // For where clause changes, we also invalidate to ensure accuracy
      return { changeType: 'invalidate' }
    }
  }

  // Case 3: Direct collection match - skip this, let incremental publisher handle it
  if (query.collection === changedCollection) {
    // Direct collection changes should be handled by the incremental publisher
    // to avoid duplicate events. The smart cross-collection publisher only
    // handles cross-collection dependencies.
    return { changeType: null }
  }

  return { changeType: null }
}

/**
 * Check if populate fields are affected by the document change
 */
async function checkPopulateAffected({
  query,
  changedCollection,
  // documentId,
  // document,
  // originalDoc,
  // operationType,
  // req,
}: {
  query: {
    queryKey: string
    collection: string
    queryType: 'find' | 'findByID' | 'count'
    params: {
      where?: any
      sort?: string
      limit?: number
      populate?: any
    }
  }
  changedCollection: string
  documentId: string
  document: any
  originalDoc: any
  operationType: 'create' | 'update' | 'delete'
  req: PayloadRequest
}): Promise<boolean> {
  if (!query.params.populate) return false

  // For now, we'll use a simple heuristic approach
  // In a more sophisticated implementation, we would:
  // 1. Parse the populate structure
  // 2. Check if any populated fields reference the changed collection
  // 3. Query the database to see if any documents in the query collection
  //    actually reference the changed document

  // Simple check: if any populate field might reference the changed collection
  const populateFields = Object.keys(query.params.populate)

  // Heuristic mapping of field names to collections
  const fieldToCollectionMapping: Record<string, string> = {
    assignee: 'users',
    author: 'users',
    user: 'users',
    createdBy: 'users',
    updatedBy: 'users',
    project: 'projects',
    task: 'tasks',
    workspace: 'workspaces',
  }

  for (const fieldName of populateFields) {
    const expectedCollection = fieldToCollectionMapping[fieldName]
    if (expectedCollection === changedCollection) {
      console.log(
        `[SMART-CROSS-COLLECTION] Query ${query.queryKey} populates ${fieldName} which references ${changedCollection}`,
      )

      // TODO: For maximum precision, we could query the database here to check
      // if any documents in query.collection actually reference documentId in fieldName
      // For now, we assume it might be affected
      return true
    }
  }

  return false
}

/**
 * Check if where clause filters are affected by the document change
 */
function checkWhereClauseAffected(
  where: any,
  changedCollection: string,
  documentId: string,
  document: any,
  originalDoc: any,
): boolean {
  if (!where || typeof where !== 'object') return false

  // Handle logical operators recursively
  if (Array.isArray(where.and)) {
    return where.and.some((condition: any) =>
      checkWhereClauseAffected(condition, changedCollection, documentId, document, originalDoc),
    )
  }

  if (Array.isArray(where.or)) {
    return where.or.some((condition: any) =>
      checkWhereClauseAffected(condition, changedCollection, documentId, document, originalDoc),
    )
  }

  // Check for relationship field filters
  for (const [fieldPath, condition] of Object.entries(where)) {
    if (fieldPath === 'and' || fieldPath === 'or') continue

    if (fieldPath.includes('.')) {
      // Nested field access like "assignee.name" indicates dependency on related collection
      const [relationField] = fieldPath.split('.')

      // Simple heuristic check
      const fieldToCollectionMapping: Record<string, string> = {
        assignee: 'users',
        author: 'users',
        user: 'users',
        project: 'projects',
        // Add more mappings
      }

      const expectedCollection = fieldToCollectionMapping[relationField]
      if (expectedCollection === changedCollection) {
        console.log(
          `[SMART-CROSS-COLLECTION] Where clause filters on ${fieldPath} which references ${changedCollection}`,
        )
        return true
      }
    }
  }

  return false
}

/**
 * Send cross-collection update notifications to affected sessions
 */
async function sendCrossCollectionUpdates(
  updates: Array<{
    clientId: string
    queryKey: string
    changeType: 'insert' | 'update' | 'delete' | 'upsert' | 'invalidate'
    data?: any
  }>,
  changedCollection: string,
  operationType: 'create' | 'update' | 'delete',
): Promise<void> {
  const subscriptions = getSubscriptions()

  // Group updates by session to batch them
  const updatesBySession = new Map<string, typeof updates>()

  for (const update of updates) {
    if (!updatesBySession.has(update.clientId)) {
      updatesBySession.set(update.clientId, [])
    }
    updatesBySession.get(update.clientId)!.push(update)
  }

  // Send batched updates to each session
  for (const [clientId, sessionUpdates] of updatesBySession) {
    const session = await subscriptions.getSession(clientId)

    // Separate invalidate updates from incremental updates
    const invalidateUpdates = sessionUpdates.filter((u) => u.changeType === 'invalidate')
    const incrementalUpdates = sessionUpdates.filter((u) => u.changeType !== 'invalidate')

    // Send invalidate updates as cross-collection updates (triggers refetch)
    if (invalidateUpdates.length > 0) {
      const invalidatePayload = {
        type: 'cross_collection_updates',
        updates: invalidateUpdates.map((update) => ({
          queryKey: update.queryKey,
          changeType: update.changeType,
          data: update.data,
        })),
        sourceCollection: changedCollection,
        operationType,
        timestamp: Date.now(),
      }

      try {
        const client = clients.get(session.clientId)
        if (!client) {
          console.log(`Client not found: ${session.clientId}`)
          continue
        }
        client.writer.write(
          new TextEncoder().encode(`data: ${JSON.stringify(invalidatePayload)}\n\n`),
        )
        console.log(
          `[SMART-CROSS-COLLECTION] Sent ${invalidateUpdates.length} invalidate updates to session ${clientId}`,
        )
      } catch (error) {
        console.error(
          `[SMART-CROSS-COLLECTION] Failed to send invalidate updates to session ${clientId}:`,
          error,
        )
      }
    }

    // Send incremental updates as incremental updates (precise document changes)
    if (incrementalUpdates.length > 0) {
      const incrementalPayload = {
        type: 'incremental_updates',
        updates: incrementalUpdates.map((update) => ({
          queryKey: update.queryKey,
          changeType: update.changeType,
          data: update.data,
        })),
        timestamp: Date.now(),
      }

      try {
        const client = clients.get(session.clientId)
        if (!client) {
          console.log(`Client not found: ${session.clientId}`)
          continue
        }
        client.writer.write(
          new TextEncoder().encode(`data: ${JSON.stringify(incrementalPayload)}\n\n`),
        )
        console.log(
          `[SMART-CROSS-COLLECTION] Sent ${incrementalUpdates.length} incremental updates to session ${clientId}`,
        )
      } catch (error) {
        console.error(
          `[SMART-CROSS-COLLECTION] Failed to send incremental updates to session ${clientId}:`,
          error,
        )
      }
    }
  }

  console.log(
    `[SMART-CROSS-COLLECTION] Sent cross-collection updates to ${updatesBySession.size} sessions`,
  )
}
