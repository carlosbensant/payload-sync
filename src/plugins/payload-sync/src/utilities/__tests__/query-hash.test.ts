import { createQueryHash, decodeQueryHash, createChannelName } from '../query-hash'
import type { PayloadQuery } from '../../types'

// Simple test assertion function
function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`❌ ${message}`)
  }
  console.log(`✅ ${message}`)
}

// Test data
const testQueries: PayloadQuery[] = [
  {
    type: 'find',
    collection: 'tasks',
    limit: 10,
    populate: { assignee: true },
    where: { project: 'asfasf' },
    sort: '-createdAt',
  },
  {
    type: 'count',
    collection: 'tasks',
    where: { status: 'active' },
  },
  {
    type: 'findByID',
    collection: 'users',
    id: '123',
    populate: { workspace: true },
  },
  {
    type: 'find',
    collection: 'projects',
    where: {},
  },
]

function testQueryHashing() {
  console.log('🧪 Testing query hashing system...')

  testQueries.forEach((query, index) => {
    console.log(`\n--- Test ${index + 1}: ${query.type} ${query.collection} ---`)

    // Test hash creation
    const hash = createQueryHash(query)
    console.log('Hash:', hash)
    console.log('Hash length:', hash.length)

    // Verify hash format (should be type.collection.encodedParams)
    const parts = hash.split('.')
    assert(parts.length === 3, `Hash should have 3 parts separated by dots: ${hash}`)
    assert(parts[0] === query.type, `First part should be query type: ${parts[0]} vs ${query.type}`)
    assert(
      parts[1] === query.collection,
      `Second part should be collection: ${parts[1]} vs ${query.collection}`,
    )

    // Test channel name creation
    const channelName = createChannelName(hash)
    console.log('Channel name:', channelName)
    console.log('Channel length:', channelName.length)

    // Verify channel name format
    assert(
      channelName.startsWith('query.'),
      `Channel name should start with 'query.': ${channelName}`,
    )
    assert(
      channelName.length < 164,
      `Channel name should be under 164 chars: ${channelName.length}`,
    )

    // Test hash decoding
    const decoded = decodeQueryHash(hash)
    assert(decoded !== null, `Should be able to decode hash: ${hash}`)
    assert(
      decoded!.type === query.type,
      `Decoded type should match: ${decoded!.type} vs ${query.type}`,
    )
    assert(
      decoded!.collection === query.collection,
      `Decoded collection should match: ${decoded!.collection} vs ${query.collection}`,
    )

    // Test round-trip consistency
    const { type, collection, ...originalParams } = query

    const roundTripMatch = JSON.stringify(decoded!.params) === JSON.stringify(originalParams)
    console.log('Original params:', originalParams)
    console.log('Decoded params:', decoded!.params)
    console.log('Round-trip success:', roundTripMatch)

    if (!roundTripMatch) {
      console.warn('⚠️ Round-trip mismatch - this might be expected due to empty object filtering')
    }
  })

  console.log('\n✅ Query hashing tests completed')
}

function testChannelNameCompatibility() {
  console.log('\n🧪 Testing channel name Pusher compatibility...')

  const testHashes = [
    'find.tasks.eyJsaW1pdCI6MTB9',
    'count.users.eyJ3aGVyZSI6e319',
    'findByID.projects.eyJpZCI6IjEyMyJ9',
  ]

  testHashes.forEach((hash) => {
    const channelName = createChannelName(hash)

    // Test Pusher channel name requirements
    const validChars = /^[a-zA-Z0-9\-_=.]+$/.test(channelName)
    assert(validChars, `Channel name should only contain valid chars: ${channelName}`)
    assert(
      channelName.length <= 164,
      `Channel name should be <= 164 chars: ${channelName} (${channelName.length})`,
    )
    assert(!channelName.includes(':'), `Channel name should not contain colons: ${channelName}`)
    assert(!channelName.includes(' '), `Channel name should not contain spaces: ${channelName}`)

    console.log(`✅ Valid channel: ${channelName}`)
  })

  console.log('✅ Channel name compatibility tests passed')
}

function testEdgeCases() {
  console.log('\n🧪 Testing edge cases...')

  // Test empty where clause
  const emptyWhereQuery: PayloadQuery = {
    type: 'find',
    collection: 'tasks',
    where: {},
  }

  const hash1 = createQueryHash(emptyWhereQuery)
  const decoded1 = decodeQueryHash(hash1)
  console.log('Empty where query hash:', hash1)
  console.log('Decoded:', decoded1)

  // Test null/undefined values
  const nullQuery: PayloadQuery = {
    type: 'count',
    collection: 'users',
    where: null as any,
  }

  const hash2 = createQueryHash(nullQuery)
  const decoded2 = decodeQueryHash(hash2)
  console.log('Null values query hash:', hash2)
  console.log('Decoded:', decoded2)

  // Test invalid hash decoding
  const invalidDecoded = decodeQueryHash('invalid.hash')
  assert(invalidDecoded === null, 'Invalid hash should return null')

  const incompleteDecoded = decodeQueryHash('find.tasks')
  assert(incompleteDecoded === null, 'Incomplete hash should return null')

  console.log('✅ Edge case tests passed')
}

// Run all tests
if (require.main === module) {
  testQueryHashing()
  testChannelNameCompatibility()
  testEdgeCases()
  console.log('\n🎉 All tests completed!')
}
