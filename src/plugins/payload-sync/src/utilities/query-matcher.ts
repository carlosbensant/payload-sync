/**
 * Check if a document matches a query subscription
 */
export function documentMatchesQuery(doc: any, subscription: any): boolean {
  if (!subscription.where || Object.keys(subscription.where).length === 0) {
    return true // No where clause means all documents match
  }

  return evaluateWhereClause(doc, subscription.where)
}

/**
 * Evaluate a where clause against a document
 */
function evaluateWhereClause(doc: any, whereClause: any): boolean {
  if (!whereClause || typeof whereClause !== 'object') {
    return true
  }

  // Handle 'and' operator
  if (whereClause.and && Array.isArray(whereClause.and)) {
    return whereClause.and.every((condition: any) => evaluateWhereClause(doc, condition))
  }

  // Handle 'or' operator
  if (whereClause.or && Array.isArray(whereClause.or)) {
    return whereClause.or.some((condition: any) => evaluateWhereClause(doc, condition))
  }

  // Handle field-level conditions
  for (const [fieldPath, condition] of Object.entries(whereClause)) {
    if (!evaluateFieldCondition(doc, fieldPath, condition)) {
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
    // Direct value comparison
    return compareValues(fieldValue, condition)
  }

  // Handle different operators
  for (const [operator, expectedValue] of Object.entries(condition)) {
    switch (operator) {
      case 'equals':
        if (!compareValues(fieldValue, expectedValue)) return false
        break

      case 'not_equals':
        if (compareValues(fieldValue, expectedValue)) return false
        break

      case 'in':
        if (
          !Array.isArray(expectedValue) ||
          !expectedValue.some((val) => compareValues(fieldValue, val))
        )
          return false
        break

      case 'not_in':
        if (
          Array.isArray(expectedValue) &&
          expectedValue.some((val) => compareValues(fieldValue, val))
        )
          return false
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
        console.warn(`[QUERY-MATCHER] Unknown operator: ${operator}`)
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
 * Compare two values, handling relationships and different types
 */
function compareValues(fieldValue: any, expectedValue: any): boolean {
  // Handle direct equality first
  if (fieldValue === expectedValue) {
    return true
  }

  // Handle relationship fields: compare populated object's ID against string ID
  if (
    typeof fieldValue === 'object' &&
    fieldValue !== null &&
    fieldValue.id &&
    typeof expectedValue === 'string'
  ) {
    return fieldValue.id === expectedValue
  }

  // Handle reverse case: string field value against populated object
  if (
    typeof fieldValue === 'string' &&
    typeof expectedValue === 'object' &&
    expectedValue !== null &&
    expectedValue.id
  ) {
    return fieldValue === expectedValue.id
  }

  // Default comparison
  return fieldValue === expectedValue
}
