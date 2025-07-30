import type { SanitizedConfig, Field, CollectionConfig } from 'payload'
import type { PayloadQuery, FindQuery, FindByIDQuery, CountQuery } from '../types'

/**
 * Extract all collections that a query depends on based on populate and where clauses
 * Uses the actual PayloadCMS schema to understand relationships
 */
export function extractQueryDependencies(
  query: PayloadQuery,
  payloadConfig: SanitizedConfig,
): Set<string> {
  const dependencies = new Set<string>()
  dependencies.add(query.collection) // Always depends on itself

  // Get the collection configuration from payload config
  const collectionConfig = payloadConfig.collections.find((col) => col.slug === query.collection)

  if (!collectionConfig) {
    console.warn(`[SCHEMA-DEPS] Collection ${query.collection} not found in config`)
    return dependencies
  }

  // Extract dependencies from populate (find and findByID queries)
  if (query.type === 'find' || query.type === 'findByID') {
    const queryWithPopulate = query as FindQuery | FindByIDQuery
    if (queryWithPopulate.populate) {
      extractPopulateDependencies(
        queryWithPopulate.populate,
        collectionConfig,
        dependencies,
        payloadConfig,
      )
    }
  }

  // Extract dependencies from where clauses (find and count queries)
  if (query.type === 'find' || query.type === 'count') {
    const queryWithWhere = query as FindQuery | CountQuery
    if (queryWithWhere.where) {
      extractWhereDependencies(queryWithWhere.where, collectionConfig, dependencies, payloadConfig)
    }
  }

  return dependencies
}

/**
 * Extract dependencies from populate configuration using schema
 */
function extractPopulateDependencies(
  populate: any,
  collectionConfig: CollectionConfig,
  dependencies: Set<string>,
  payloadConfig: SanitizedConfig,
): void {
  if (typeof populate !== 'object' || populate === null) {
    return
  }

  for (const [fieldName, config] of Object.entries(populate)) {
    if (config === true || (typeof config === 'object' && config !== null)) {
      // Find the field in the collection schema
      const field = findFieldInCollection(fieldName, collectionConfig.fields)

      if (field) {
        const targetCollections = getRelationshipTargets(field)
        targetCollections.forEach((collection) => dependencies.add(collection))

        // Handle nested populate
        if (typeof config === 'object' && config !== null && 'populate' in config) {
          // For each target collection, recursively extract dependencies
          targetCollections.forEach((targetCollection) => {
            const targetConfig = payloadConfig.collections.find(
              (col) => col.slug === targetCollection,
            )
            if (targetConfig) {
              extractPopulateDependencies(
                (config as any).populate,
                targetConfig,
                dependencies,
                payloadConfig,
              )
            }
          })
        }
      }
    }
  }
}

/**
 * Extract dependencies from where clauses that filter on relationships
 */
function extractWhereDependencies(
  where: any,
  collectionConfig: CollectionConfig,
  dependencies: Set<string>,
  payloadConfig: SanitizedConfig,
): void {
  if (typeof where !== 'object' || where === null) {
    return
  }

  // Handle logical operators
  if (Array.isArray(where.and)) {
    where.and.forEach((condition: any) =>
      extractWhereDependencies(condition, collectionConfig, dependencies, payloadConfig),
    )
  }

  if (Array.isArray(where.or)) {
    where.or.forEach((condition: any) =>
      extractWhereDependencies(condition, collectionConfig, dependencies, payloadConfig),
    )
  }

  // Look for relationship field filters
  for (const [fieldPath, condition] of Object.entries(where)) {
    if (fieldPath === 'and' || fieldPath === 'or') continue

    if (fieldPath.includes('.')) {
      // Nested field access like "assignee.name" indicates dependency on related collection
      const [relationField] = fieldPath.split('.')
      const field = findFieldInCollection(relationField, collectionConfig.fields)

      if (field) {
        const targetCollections = getRelationshipTargets(field)
        targetCollections.forEach((collection) => dependencies.add(collection))
      }
    } else {
      // Direct relationship field filter
      const field = findFieldInCollection(fieldPath, collectionConfig.fields)
      if (field) {
        const targetCollections = getRelationshipTargets(field)
        targetCollections.forEach((collection) => dependencies.add(collection))
      }
    }
  }
}

/**
 * Find a field in a collection's fields array (supports nested fields)
 */
function findFieldInCollection(fieldName: string, fields: Field[]): Field | null {
  for (const field of fields) {
    if ('name' in field && field.name === fieldName) {
      return field
    }

    // Check nested fields (groups, tabs, etc.)
    if ('fields' in field && Array.isArray(field.fields)) {
      const nestedField = findFieldInCollection(fieldName, field.fields)
      if (nestedField) return nestedField
    }

    // Check tabs
    if ('tabs' in field && Array.isArray(field.tabs)) {
      for (const tab of field.tabs) {
        if ('fields' in tab && Array.isArray(tab.fields)) {
          const tabField = findFieldInCollection(fieldName, tab.fields)
          if (tabField) return tabField
        }
      }
    }
  }

  return null
}

/**
 * Get target collections from a relationship field
 */
function getRelationshipTargets(field: Field): string[] {
  if (field.type === 'relationship') {
    const relationTo = field.relationTo
    if (typeof relationTo === 'string') {
      return [relationTo]
    } else if (Array.isArray(relationTo)) {
      return relationTo as string[]
    }
  }

  if (field.type === 'join') {
    return [field.collection as string]
  }

  return []
}

/**
 * Debug function to log dependency extraction
 */
export function logQueryDependencies(
  queryKey: string,
  query: PayloadQuery,
  dependencies: Set<string>,
): void {
  console.log(
    `[SCHEMA-DEPS] Query ${queryKey} (${query.collection}) depends on: ${Array.from(dependencies).join(', ')}`,
  )

  if (query.type === 'find' || query.type === 'findByID') {
    const queryWithPopulate = query as FindQuery | FindByIDQuery
    if (queryWithPopulate.populate) {
      console.log(`  - Populate: ${JSON.stringify(queryWithPopulate.populate)}`)
    }
  }

  if (query.type === 'find' || query.type === 'count') {
    const queryWithWhere = query as FindQuery | CountQuery
    if (queryWithWhere.where) {
      console.log(`  - Where: ${JSON.stringify(queryWithWhere.where)}`)
    }
  }
}
