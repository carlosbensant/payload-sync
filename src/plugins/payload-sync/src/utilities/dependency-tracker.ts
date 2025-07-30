import type { SanitizedConfig } from 'payload'
import type { PayloadQuery } from '../types'
import { extractQueryDependencies, logQueryDependencies } from './schema-dependency-extractor'
import { getSubscriptions } from './endpoints'

// Store payload config for schema-driven dependency extraction
let payloadConfig: SanitizedConfig | null = null

/**
 * Initialize the dependency tracker with payload configuration
 */
export function initializeDependencyTracker(config: SanitizedConfig) {
  payloadConfig = config
  console.log('[DependencyTracker] Initialized with schema-driven dependency extraction')
}

/**
 * Extract all collections that a query depends on based on populate and where clauses
 */
function extractDependencies(collection: string, populate?: any, where?: any): Set<string> {
  const dependencies = new Set<string>()
  dependencies.add(collection) // Always depends on itself

  // Extract dependencies from populate
  if (populate && typeof populate === 'object') {
    extractPopulateDependencies(populate, dependencies)
  }

  // Extract dependencies from where clauses (for relationship filters)
  if (where && typeof where === 'object') {
    extractWhereDependencies(where, dependencies)
  }

  return dependencies
}

/**
 * Extract dependencies from populate configuration
 */
function extractPopulateDependencies(populate: any, dependencies: Set<string>) {
  for (const [fieldName, config] of Object.entries(populate)) {
    if (config === true) {
      // Simple relationship - infer collection name from field name
      const relatedCollection = inferCollectionFromField(fieldName)
      if (relatedCollection) {
        dependencies.add(relatedCollection)
      }
    } else if (typeof config === 'object' && config !== null) {
      // Nested populate
      if ('populate' in config) {
        extractPopulateDependencies((config as any).populate, dependencies)
      }
      // Could also have collection specified explicitly
      if ('collection' in config) {
        dependencies.add((config as any).collection)
      }
    }
  }
}

/**
 * Extract dependencies from where clauses that filter on relationships
 */
function extractWhereDependencies(where: any, dependencies: Set<string>) {
  if (Array.isArray(where.and)) {
    where.and.forEach((condition: any) => extractWhereDependencies(condition, dependencies))
  }

  if (Array.isArray(where.or)) {
    where.or.forEach((condition: any) => extractWhereDependencies(condition, dependencies))
  }

  // Look for relationship field filters
  for (const [fieldPath, condition] of Object.entries(where)) {
    if (fieldPath.includes('.')) {
      // Nested field access like "assignee.name" indicates dependency on users collection
      const [relationField] = fieldPath.split('.')
      const relatedCollection = inferCollectionFromField(relationField)
      if (relatedCollection) {
        dependencies.add(relatedCollection)
      }
    }
  }
}

/**
 * Infer collection name from relationship field name
 * This is a heuristic - in a real implementation, you'd want this to be more robust
 * by consulting the PayloadCMS schema/config
 */
function inferCollectionFromField(fieldName: string): string | null {
  // Common patterns
  const fieldToCollection: Record<string, string> = {
    assignee: 'users',
    user: 'users',
    author: 'users',
    createdBy: 'users',
    updatedBy: 'users',
    project: 'projects',
    task: 'tasks',
    workspace: 'workspaces',
    // Add more mappings as needed
  }

  return fieldToCollection[fieldName] || null
}

/**
 * Register a query and its dependencies using schema-driven extraction
 */
export async function registerQueryDependencies({
  queryKey,
  collection,
  params: { populate, where },
}: {
  queryKey: string
  collection: string
  params: {
    populate?: any
    where?: any
  }
}) {
  const subscriptions = getSubscriptions()

  if (!payloadConfig) {
    console.warn(
      '[DependencyTracker] PayloadConfig not initialized, falling back to heuristic approach',
    )
    const dependencies = extractDependencies(collection, populate, where)

    await subscriptions.addDependencies(queryKey, {
      collection,
      dependencies,
      query: { type: 'find', collection, populate, where } as PayloadQuery,
    })

    await subscriptions.addReverseDependencies(queryKey, dependencies)

    console.log(
      `[DependencyTracker] Query ${queryKey} depends on collections: ${Array.from(dependencies).join(', ')}`,
    )
    return
  }

  // Create query object for schema-driven extraction
  const query: PayloadQuery = {
    type: 'find', // Default to find, can be updated if needed
    collection,
    populate,
    where,
  } as PayloadQuery

  const dependencies = extractQueryDependencies(query, payloadConfig)

  // Store the dependency mapping
  await subscriptions.addDependencies(queryKey, {
    collection,
    dependencies,
    query,
  })

  await subscriptions.addReverseDependencies(queryKey, dependencies)

  // Log dependencies for debugging
  logQueryDependencies(queryKey, query, dependencies)
}

/**
 * Get all query keys that depend on a specific collection
 */
export async function getQueriesDependingOn(collection: string): Promise<string[]> {
  const subscriptions = getSubscriptions()
  const reverseDependency = await subscriptions.getReverseDependencies()
  return reverseDependency[collection] || []
}

/**
 * Unregister a query and clean up its dependencies
 */
export async function unregisterQueryDependencies(queryKey: string) {
  const subscriptions = getSubscriptions()
  await subscriptions.removeDependencies(queryKey)
}

/**
 * Get dependency stats for debugging
 */
export async function getDependencyStats() {
  const subscriptions = getSubscriptions()
  const dependencies = await subscriptions.getDependencies()
  const reverseDependencies = await subscriptions.getDependencies()

  return {
    totalQueries: Object.keys(dependencies).length,
    dependencyMap: { ...dependencies },
    reverseDependencyMap: { ...reverseDependencies },
  }
}
