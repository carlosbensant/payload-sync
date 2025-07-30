import type { PayloadRequest } from 'payload'

/**
 * Efficient access control evaluator that mimics Convex's approach.
 * Instead of re-running full queries, this evaluates access control rules
 * against individual documents without database round-trips.
 */

interface AccessControlResult {
  allowed: boolean
  reason?: string
}

interface CollectionAccessConfig {
  read?: (args: any) => boolean | object | Promise<boolean | object>
  update?: (args: any) => boolean | object | Promise<boolean | object>
  delete?: (args: any) => boolean | object | Promise<boolean | object>
  create?: (args: any) => boolean | object | Promise<boolean | object>
}

// Cache for collection access control functions
const accessControlCache = new Map<string, CollectionAccessConfig>()

/**
 * Register access control functions for a collection
 */
export function registerAccessControl(collection: string, accessConfig: CollectionAccessConfig) {
  accessControlCache.set(collection, accessConfig)
}

/**
 * Efficiently evaluate if a user can read a specific document
 * without making database queries
 */
export async function canUserAccessDocument(
  collection: string,
  document: any,
  userContext: PayloadRequest,
  operation: 'read' | 'update' | 'delete' = 'read',
): Promise<AccessControlResult> {
  try {
    const accessConfig = accessControlCache.get(collection)

    if (!accessConfig || !accessConfig[operation]) {
      // No access control defined, use default (authenticated users only)
      return {
        allowed: Boolean(userContext.user),
        reason: userContext.user ? 'Default access granted' : 'Authentication required',
      }
    }

    const accessFunction = accessConfig[operation]

    // Prepare arguments similar to PayloadCMS access control
    const args = {
      req: userContext,
      doc: document,
      id: document?.id,
      data: document,
    }

    // Execute the access control function
    const result = await accessFunction(args)

    if (typeof result === 'boolean') {
      return {
        allowed: result,
        reason: result ? 'Access granted by function' : 'Access denied by function',
      }
    }

    if (typeof result === 'object' && result !== null) {
      // Access control returned a query constraint
      // We need to evaluate if the document matches this constraint
      const matches = evaluateDocumentAgainstConstraint(document, result)
      return {
        allowed: matches,
        reason: matches
          ? 'Document matches access constraint'
          : 'Document does not match access constraint',
      }
    }

    return {
      allowed: false,
      reason: 'Access control function returned invalid result',
    }
  } catch (error) {
    console.error('Error evaluating access control:', error)
    return {
      allowed: false,
      reason: `Access control error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

/**
 * Evaluate if a document matches a query constraint
 * This is similar to our existing documentMatchesQuery but specifically for access control
 */
function evaluateDocumentAgainstConstraint(document: any, constraint: any): boolean {
  if (!constraint || typeof constraint !== 'object') {
    return true
  }

  // Handle 'and' operator
  if (constraint.and && Array.isArray(constraint.and)) {
    return constraint.and.every((condition: any) =>
      evaluateDocumentAgainstConstraint(document, condition),
    )
  }

  // Handle 'or' operator
  if (constraint.or && Array.isArray(constraint.or)) {
    return constraint.or.some((condition: any) =>
      evaluateDocumentAgainstConstraint(document, condition),
    )
  }

  // Handle field-level conditions
  for (const [fieldPath, condition] of Object.entries(constraint)) {
    if (!evaluateFieldCondition(document, fieldPath, condition)) {
      return false
    }
  }

  return true
}

/**
 * Evaluate a field condition against a document
 */
function evaluateFieldCondition(doc: any, fieldPath: string, condition: any): boolean {
  const fieldValue = getNestedValue(doc, fieldPath)

  if (typeof condition !== 'object' || condition === null) {
    return fieldValue === condition
  }

  for (const [operator, expectedValue] of Object.entries(condition)) {
    switch (operator) {
      case 'equals':
        if (fieldValue !== expectedValue) return false
        break

      case 'not_equals':
        if (fieldValue === expectedValue) return false
        break

      case 'in':
        if (!Array.isArray(expectedValue) || !expectedValue.includes(fieldValue)) return false
        break

      case 'not_in':
        if (Array.isArray(expectedValue) && expectedValue.includes(fieldValue)) return false
        break

      case 'greater_than':
        if (fieldValue <= (expectedValue as number)) return false
        break

      case 'greater_than_equal':
        if (fieldValue < (expectedValue as number)) return false
        break

      case 'less_than':
        if (fieldValue >= (expectedValue as number)) return false
        break

      case 'less_than_equal':
        if (fieldValue > (expectedValue as number)) return false
        break

      case 'like':
        if (typeof fieldValue !== 'string' || typeof expectedValue !== 'string') return false
        if (!fieldValue.toLowerCase().includes(expectedValue.toLowerCase())) return false
        break

      case 'contains':
        if (typeof fieldValue !== 'string' || typeof expectedValue !== 'string') return false
        if (!fieldValue.includes(expectedValue)) return false
        break

      case 'exists':
        const exists = fieldValue !== undefined && fieldValue !== null
        if (exists !== (expectedValue as boolean)) return false
        break

      default:
        console.warn(`Unknown operator in access control: ${operator}`)
        return false
    }
  }

  return true
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
 * Batch evaluate access control for multiple documents
 * This is much more efficient than individual evaluations
 */
export async function batchEvaluateAccess(
  collection: string,
  documents: any[],
  userContext: PayloadRequest,
  operation: 'read' | 'update' | 'delete' = 'read',
): Promise<Map<string, AccessControlResult>> {
  const results = new Map<string, AccessControlResult>()

  // For efficiency, we can optimize this by checking if the access control
  // function is the same for all documents (which it usually is)
  const accessConfig = accessControlCache.get(collection)

  if (!accessConfig || !accessConfig[operation]) {
    // No access control defined, apply default to all
    const defaultResult = {
      allowed: Boolean(userContext.user),
      reason: userContext.user ? 'Default access granted' : 'Authentication required',
    }

    for (const doc of documents) {
      results.set(doc.id, defaultResult)
    }

    return results
  }

  // Evaluate each document
  for (const document of documents) {
    const result = await canUserAccessDocument(collection, document, userContext, operation)
    results.set(document.id, result)
  }

  return results
}
