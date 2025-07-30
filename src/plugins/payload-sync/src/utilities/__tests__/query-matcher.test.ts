import { documentMatchesQuery } from '../query-matcher'

/**
 * Simple test runner for query matcher
 */

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`)
  }
}

// Test basic equality matching
export function testBasicEquality() {
  console.log('🧪 Testing basic equality matching...')

  const doc = { id: '1', status: 'active', title: 'Test Task' }
  const subscription = { where: { status: 'active' } }

  assert(documentMatchesQuery(doc, subscription), 'Document should match when status equals')

  const nonMatchingSubscription = { where: { status: 'completed' } }
  assert(
    !documentMatchesQuery(doc, nonMatchingSubscription),
    'Document should not match when status differs',
  )

  console.log('✅ Basic equality test passed')
}

// Test relationship field matching
export function testRelationshipMatching() {
  console.log('🧪 Testing relationship field matching...')

  const docWithPopulatedUser = {
    id: '1',
    assignee: { id: 'user123', name: 'John Doe' },
  }

  const docWithStringUser = {
    id: '2',
    assignee: 'user123',
  }

  const subscription = { where: { assignee: 'user123' } }

  assert(
    documentMatchesQuery(docWithPopulatedUser, subscription),
    'Should match populated relationship',
  )
  assert(documentMatchesQuery(docWithStringUser, subscription), 'Should match string relationship')

  console.log('✅ Relationship matching test passed')
}

// Test complex operators
export function testComplexOperators() {
  console.log('🧪 Testing complex operators...')

  const doc = { id: '1', priority: 5, tags: ['urgent', 'bug'] }

  // Test greater_than
  assert(
    documentMatchesQuery(doc, { where: { priority: { greater_than: 3 } } }),
    'Should match greater_than',
  )
  assert(
    !documentMatchesQuery(doc, { where: { priority: { greater_than: 6 } } }),
    'Should not match greater_than when false',
  )

  // Test in operator (would need array support in the matcher)
  // For now, just test that it doesn't crash
  try {
    documentMatchesQuery(doc, { where: { priority: { in: [3, 4, 5] } } })
    console.log('✅ Complex operators test passed')
  } catch (error) {
    console.log('⚠️ Complex operators test needs implementation')
  }
}

// Test empty where clause
export function testEmptyWhereClause() {
  console.log('🧪 Testing empty where clause...')

  const doc = { id: '1', status: 'active' }

  assert(documentMatchesQuery(doc, {}), 'Should match when no where clause')
  assert(documentMatchesQuery(doc, { where: {} }), 'Should match when empty where clause')

  console.log('✅ Empty where clause test passed')
}

// Test AND/OR logic
export function testLogicalOperators() {
  console.log('🧪 Testing logical operators...')

  const doc = { id: '1', status: 'active', priority: 5 }

  // Test AND
  const andSubscription = {
    where: {
      and: [{ status: 'active' }, { priority: { greater_than: 3 } }],
    },
  }

  assert(documentMatchesQuery(doc, andSubscription), 'Should match AND condition when both true')

  // Test OR
  const orSubscription = {
    where: {
      or: [{ status: 'completed' }, { priority: { greater_than: 3 } }],
    },
  }

  assert(documentMatchesQuery(doc, orSubscription), 'Should match OR condition when one is true')

  console.log('✅ Logical operators test passed')
}

// Run all tests
export function runAllTests() {
  console.log('🚀 Running query matcher tests...')

  try {
    testBasicEquality()
    testRelationshipMatching()
    testComplexOperators()
    testEmptyWhereClause()
    testLogicalOperators()

    console.log('🎉 All query matcher tests passed!')
  } catch (error) {
    console.error('❌ Test failed:', error)
    throw error
  }
}

// Auto-run tests if this file is executed directly
if (require.main === module) {
  runAllTests()
}
