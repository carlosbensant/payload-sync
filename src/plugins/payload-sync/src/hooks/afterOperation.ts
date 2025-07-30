import type { CollectionAfterOperationHook, CollectionBeforeChangeHook } from 'payload'
import { publishChanges } from '../utilities/smart-publisher'

export const beforeChange: CollectionBeforeChangeHook = async ({ req, originalDoc }) => {
  // Store the original document in req.context so afterOperation can access it
  if (originalDoc) {
    if (!req.context) {
      req.context = {}
    }
    req.context.originalDoc = originalDoc
    console.log('📝 [BEFORE-CHANGE] Stored originalDoc in req.context:', originalDoc.id)
  }
}

export const afterOperation: CollectionAfterOperationHook = async ({
  collection,
  result,
  operation,
  req,
  args,
}) => {
  // Early exit for read operations (no logging to reduce noise)
  if (!['create', 'update', 'updateByID', 'delete', 'deleteByID'].includes(operation)) {
    return result
  }

  console.log(
    '🔄 [AFTER-OPERATION] Processing operation for collection:',
    collection.slug,
    'operation:',
    operation,
    'doc:',
    (result as any)?.id || 'unknown',
  )

  // Map PayloadCMS operation to our operation type
  let operationType: 'create' | 'update' | 'delete'
  if (operation === 'create') {
    operationType = 'create'
  } else if (['update', 'updateByID'].includes(operation)) {
    operationType = 'update'
  } else if (['delete', 'deleteByID'].includes(operation)) {
    operationType = 'delete'
  } else {
    console.log(`⏭️ [AFTER-OPERATION] Unknown operation: ${operation}`)
    return result
  }

  // For delete operations, result might be undefined, use args.id
  const docId = (result as any)?.id || (args as any)?.id || 'unknown'

  console.log(
    `🎯 [AFTER-OPERATION] Mapped ${operation} → ${operationType} for ${collection.slug}:${docId}`,
  )

  // Get original document from req.context (set by beforeChange hook)
  const originalDoc = (req.context as any)?.originalDoc
  console.log(
    '🔍 [AFTER-OPERATION] originalDoc from req.context:',
    originalDoc ? `${originalDoc.id || 'no-id'}` : 'MISSING',
  )

  // Use SmartPublisher for all real-time updates (async, non-blocking)
  // We don't await this to avoid blocking the main operation
  publishChanges({
    collection: collection.slug,
    operation: operationType,
    doc: result, // Current document state
    originalDoc, // Original document from context
    req, // Request context for smart cross-collection updates
  }).catch((error: any) => {
    // Log errors but don't fail the main operation
    console.error(
      `❌ [AFTER-OPERATION] Failed to publish real-time updates for ${collection.slug}:${docId}:`,
      error,
    )
  })

  console.log(
    `✅ [AFTER-OPERATION] Initiated real-time publishing for ${operationType} on ${collection.slug}:${docId}`,
  )

  return result
}
