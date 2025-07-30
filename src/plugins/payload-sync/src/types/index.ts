export type ReadOperation = 'count' | 'find' | 'findByID'
export type WriteOperation = 'create' | 'update' | 'delete'
export type PayloadOperation = ReadOperation | WriteOperation

// Base query interface
interface BaseQuery {
  collection: string
}

// Find query - matches payload.find() parameters
export interface FindQuery extends BaseQuery {
  type: 'find'
  where?: any
  sort?: string
  limit?: number
  page?: number
  depth?: number
  populate?: any
  locale?: string
  fallbackLocale?: string
}

// FindByID query - matches payload.findByID() parameters
export interface FindByIDQuery extends BaseQuery {
  type: 'findByID'
  id: string
  depth?: number
  populate?: any
  locale?: string
  fallbackLocale?: string
}

// Count query - matches payload.count() parameters
export interface CountQuery extends BaseQuery {
  type: 'count'
  where?: any
  locale?: string
}

// Union type for all possible queries
export type PayloadQuery = (FindQuery | FindByIDQuery | CountQuery) & { clientId?: string }
