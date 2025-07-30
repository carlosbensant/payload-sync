import type { PayloadRequest } from 'payload'
import { documentMatchesQuery } from './query-matcher'
import { getSessionsForCollection } from './subscription-manager'

import { clients } from './endpoints'

/**
 * Check if a document already has populated fields
 */
function isFieldPopulated(doc: any, fieldPath: string): boolean {
  const fieldValue = getNestedValue(doc, fieldPath)

  // If field doesn't exist, it's not populated
  if (fieldValue === undefined || fieldValue === null) {
    return false
  }

  // If it's a string, it's likely just an ID (not populated)
  if (typeof fieldValue === 'string') {
    return false
  }

  // If it's an object with an id, it's likely populated
  if (typeof fieldValue === 'object' && fieldValue.id) {
    return true
  }

  // If it's an array, check if first item is populated
  if (Array.isArray(fieldValue) && fieldValue.length > 0) {
    return typeof fieldValue[0] === 'object' && fieldValue[0].id
  }

  return false
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
 * Check if document needs population based on populate config
 */
function needsPopulation(doc: any, populateConfig: any): boolean {
  if (!populateConfig || typeof populateConfig !== 'object') {
    return false
  }

  // Check each field in the populate config
  for (const fieldPath of Object.keys(populateConfig)) {
    if (!isFieldPopulated(doc, fieldPath)) {
      return true // At least one field needs population
    }
  }

  return false // All fields are already populated
}

/**
 * Populate a document using PayloadCMS populate functionality
 * Only makes the query if the document actually needs population
 */
async function populateDocument(
  doc: any,
  collection: string,
  populateConfig: any,
  req: PayloadRequest,
): Promise<any> {
  try {
    if (!populateConfig || Object.keys(populateConfig).length === 0) {
      return doc // No populate config
    }

    // Check if document already has all populated fields
    if (!needsPopulation(doc, populateConfig)) {
      console.log(`🔗 [INCREMENTAL] Document ${doc.id} already populated, skipping query`)
      return doc
    }

    console.log(`🔗 [INCREMENTAL] Populating document ${doc.id} with config:`, populateConfig)

    // Use PayloadCMS findByID with populate to get the populated document
    const populatedDoc = await req.payload.findByID({
      collection,
      id: doc.id,
      populate: populateConfig,
      req,
    } as any)

    return populatedDoc
  } catch (error) {
    console.warn(`[INCREMENTAL] Failed to populate document ${doc.id}:`, error)
    return doc // Return unpopulated document as fallback
  }
}

/**
 * Publish incremental updates for direct collection subscriptions
 */
export async function publishIncrementalUpdates({
  collection,
  operation,
  doc,
  originalDoc,
  req,
}: {
  collection: string
  operation: 'create' | 'update' | 'delete'
  doc: any
  originalDoc?: any
  req: PayloadRequest
}): Promise<void> {
  console.log(`🚀 [INCREMENTAL] Starting publishIncrementalUpdates for ${collection} ${operation}`)
  console.log(`🔍 [INCREMENTAL] doc:`, doc ? `${doc.id || 'no-id'}` : 'MISSING')
  console.log(
    `🔍 [INCREMENTAL] originalDoc:`,
    originalDoc ? `${originalDoc.id || 'no-id'}` : 'MISSING',
  )

  try {
    // Get all sessions that have queries for this collection
    const sessions = await getSessionsForCollection(collection)
    console.log(sessions, 'getSessionsForCollection - sessions')

    if (sessions.length === 0) {
      console.log(`📤 [INCREMENTAL] No sessions subscribed to collection: ${collection}`)
      return
    }

    console.log(`📤 [INCREMENTAL] Found ${sessions.length} sessions for collection: ${collection}`)

    // Process each session
    for (const session of sessions) {
      const relevantUpdates: any[] = []

      // Check each query in the session to see if it's affected by this change
      for (const query of session.queries) {
        const queryKey = query.queryKey
        if (query.collection !== collection) {
          continue // Skip queries for other collections
        }

        // Only process find and findByID queries for incremental updates
        if (query.queryType !== 'find' && query.queryType !== 'findByID') {
          continue
        }

        try {
          // Determine if this document change affects this query
          let changeType: 'insert' | 'update' | 'delete' | 'upsert' | null = null
          let relevantDoc = doc

          if (operation === 'create') {
            // Check if new document matches the query
            if (documentMatchesQuery(doc, query.params)) {
              changeType = 'insert'
            }
          } else if (operation === 'update') {
            const docMatches = documentMatchesQuery(doc, query.params)
            const originalMatches = originalDoc
              ? documentMatchesQuery(originalDoc, query.params)
              : false

            if (docMatches && originalMatches) {
              changeType = 'update'
            } else if (docMatches && !originalMatches) {
              changeType = 'upsert' // Document moved into query results
            } else if (!docMatches && originalMatches) {
              changeType = 'delete' // Document moved out of query results
              relevantDoc = originalDoc
            }
          } else if (operation === 'delete') {
            // Check if deleted document was in the query results
            if (originalDoc && documentMatchesQuery(originalDoc, query.params)) {
              changeType = 'delete'
              relevantDoc = originalDoc
            }
          }

          // If this change affects the query, populate and add to relevant updates
          if (changeType) {
            let finalDoc = relevantDoc

            // Populate the document if the query has populate config and it's not a delete
            if (changeType !== 'delete' && query.params.populate) {
              finalDoc = await populateDocument(relevantDoc, collection, query.params.populate, req)
            }

            relevantUpdates.push({
              queryKey,
              changeType,
              data: finalDoc,
            })
          }
        } catch (error) {
          console.error(`[INCREMENTAL] Error processing query ${queryKey}:`, error)
        }
      }

      // Send all relevant updates to this session's channel
      if (relevantUpdates.length > 0) {
        const updateData = {
          type: 'incremental_updates',
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
          `📤 [INCREMENTAL] Sent ${relevantUpdates.length} updates to session ${session.clientId}`,
        )
      }
    }
  } catch (error) {
    console.error('[INCREMENTAL] Failed to publish updates:', error)
  }
}
