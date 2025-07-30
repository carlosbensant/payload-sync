import { PayloadRequest } from 'payload'
import { clients } from './endpoints'
import { getSessionsForCollection } from './subscription-manager'

/**
 * Publish count updates for collection changes
 */
export async function publishCountUpdates({
  collection,
  // operation,
  // doc,
  // originalDoc,
  // req,
}: {
  collection: string
  operation: 'create' | 'update' | 'delete'
  doc: any
  originalDoc?: any
  req: PayloadRequest
}): Promise<void> {
  try {
    // Get all sessions that have count queries for this collection
    const sessions = await getSessionsForCollection(collection)
    console.log(sessions, 'publishCountUpdates - getSessionsForCollection - sessions')

    if (sessions.length === 0) {
      console.log(`📤 [COUNT] No sessions subscribed to collection: ${collection}`)
      return
    }

    console.log(`📤 [COUNT] Found ${sessions.length} sessions for collection: ${collection}`)

    // Process each session
    for (const session of sessions) {
      const relevantUpdates: any[] = []

      // Check each count query in the session
      for (const query of session.queries) {
        const queryKey = query.queryKey
        if (query.collection !== collection || query.queryType !== 'count') {
          continue // Skip non-count queries or other collections
        }

        try {
          // For count queries, we need to indicate that a recount may be needed
          // The actual count will be recalculated on the client or via a fresh query
          relevantUpdates.push({
            queryKey,
            changeType: 'count_invalidated',
          })
        } catch (error) {
          console.error(`[COUNT] Error processing count query ${queryKey}:`, error)
        }
      }

      // Send count invalidation updates to this session's channel
      if (relevantUpdates.length > 0) {
        const updateData = {
          type: 'count_updates',
          updates: relevantUpdates,
          timestamp: Date.now(),
        }

        const client = clients.get(session.clientId)
        if (!client) {
          console.log(`Client not found: ${session.clientId}`)
          continue
        }
        client.writer.write(new TextEncoder().encode(`data: ${JSON.stringify(updateData)}\n\n`))
        console.log(
          `📤 [COUNT] Sent ${relevantUpdates.length} count updates to session ${session.clientId}`,
        )
      }
    }
  } catch (error) {
    console.error('[COUNT] Failed to publish count updates:', error)
  }
}
