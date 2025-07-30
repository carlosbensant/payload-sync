import type { PayloadQuery } from '../types'
import { Packr } from 'msgpackr'

// Create msgpackr instance
const packr = new Packr()

/**
 * Creates a compact, URL-safe hash for a query using msgpackr
 * This creates much shorter hashes than JSON+base64
 */
export function createQueryHash(query: PayloadQuery): string {
  const { type, collection, ...params } = query
  const stableParams: any = {}

  // Add common parameters that exist across query types
  // Only include parameters that have meaningful values
  if ('where' in params && params.where !== undefined && params.where !== null) {
    // Only include where clause if it has actual conditions
    if (typeof params.where === 'object' && Object.keys(params.where).length > 0) {
      stableParams.where = params.where
    }
  }
  if ('sort' in params && params.sort !== undefined && params.sort !== null) {
    stableParams.sort = params.sort
  }
  if ('limit' in params && params.limit !== undefined && params.limit !== null) {
    stableParams.limit = params.limit
  }
  if ('populate' in params && params.populate !== undefined && params.populate !== null) {
    // Only include populate if it has actual configuration
    if (typeof params.populate === 'object' && Object.keys(params.populate).length > 0) {
      stableParams.populate = params.populate
    }
  }
  if ('id' in params && params.id !== undefined && params.id !== null) {
    stableParams.id = params.id
  }

  // Create compact hash using msgpackr, with JSON fallback
  let encodedParams: string

  try {
    // Use msgpackr for compact binary encoding, then base64url for URL safety
    const buffer = packr.pack(stableParams)
    // Convert to base64url manually to ensure compatibility
    encodedParams = Buffer.from(buffer)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')
  } catch (error) {
    console.warn('msgpackr encoding failed, falling back to JSON:', error)
    encodedParams = encodeParamsAsJSON(stableParams)
  }

  // Return format: type.collection.encodedParams
  return `${type}.${collection}.${encodedParams}`
}

/**
 * Decode query parameters from a hash created by createQueryHash
 */
export function decodeQueryHash(
  hash: string,
): { type: string; collection: string; params: any } | null {
  try {
    const parts = hash.split('.')
    if (parts.length !== 3) {
      console.warn('Invalid query hash format:', hash)
      return null
    }

    const [type, collection, encodedParams] = parts

    // Try to decode using msgpackr first, then fall back to JSON
    let params: any

    try {
      // Convert from base64url back to base64, then decode
      const base64 =
        encodedParams.replace(/-/g, '+').replace(/_/g, '/') +
        '='.repeat((4 - (encodedParams.length % 4)) % 4)
      const buffer = Buffer.from(base64, 'base64')
      params = packr.unpack(buffer)
    } catch (error) {
      // Fall back to JSON decoding
      params = decodeParamsFromJSON(encodedParams)
    }

    return { type, collection, params }
  } catch (error) {
    console.warn('Failed to decode query hash:', hash, error)
    return null
  }
}

/**
 * Fallback JSON encoding (same as original implementation)
 */
function encodeParamsAsJSON(params: any): string {
  const paramsString = JSON.stringify(params, Object.keys(params).sort())
  return btoa(paramsString).replace(/[^a-zA-Z0-9]/g, '')
}

/**
 * Fallback JSON decoding
 */
function decodeParamsFromJSON(encoded: string): any {
  try {
    // Add back the padding that was removed
    const padded = encoded + '='.repeat((4 - (encoded.length % 4)) % 4)
    const jsonString = atob(padded)
    return JSON.parse(jsonString)
  } catch (error) {
    console.warn('Failed to decode JSON params:', encoded, error)
    return {}
  }
}

/**
 * Create a valid Pusher channel name from a query hash
 * Since we use dots in the hash format, no sanitization is needed
 */
export function createChannelName(queryHash: string): string {
  return `query.${queryHash}`
}
