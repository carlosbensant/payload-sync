import type { PayloadRequest } from 'payload'
import { publishIncrementalUpdates } from './incremental-publisher'
import { publishCountUpdates } from './count-publisher'
import { publishCrossCollectionUpdates as publishSmartCrossCollectionUpdates } from './smart-cross-collection-publisher'

/**
 * Main orchestrator for all real-time updates
 * Coordinates incremental, count, and cross-collection publishers
 */
export async function publishChanges({
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
  console.log(`🚀 [SMART-PUBLISHER] Publishing ${operation} for ${collection}`)

  try {
    const docId = doc?.id || 'unknown'

    // Run all publishers in parallel for maximum efficiency
    const publishPromises = [
      publishIncrementalUpdates({ collection, operation, doc, originalDoc, req }),
      publishCountUpdates({ collection, operation, doc, originalDoc, req }),
      publishSmartCrossCollectionUpdates({ collection, docId, doc, originalDoc, operation, req }),
    ]

    // if (req) {
    //   // Use smart cross-collection publisher if request context is available
    //   publishPromises.push(
    //     publishSmartCrossCollectionUpdates(collection, docId, doc, originalDoc, operation, req),
    //   )
    // }

    const results = await Promise.allSettled(publishPromises)

    // Log any failures
    results.forEach((result, index) => {
      const publisherNames = [
        'INCREMENTAL',
        'COUNT',
        req ? 'SMART-CROSS-COLLECTION' : 'CROSS-COLLECTION',
      ]
      if (result.status === 'rejected') {
        console.error(`❌ [${publisherNames[index]}] Publisher failed:`, result.reason)
      }
    })

    console.log(`✅ [SMART-PUBLISHER] Completed publishing ${operation} for ${collection}`)
  } catch (error) {
    console.error(`❌ [SMART-PUBLISHER] Failed to publish ${operation} for ${collection}:`, error)
  }
}
