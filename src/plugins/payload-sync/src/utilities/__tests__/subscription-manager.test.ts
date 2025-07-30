import {
  registerIncrementalSubscription,
  registerCountSubscription,
  getIncrementalSubscription,
  getCountSubscriptionsForCollection,
  getSubscriptionStats,
} from '../subscription-manager'

/**
 * Simple test runner for subscription manager
 * Run this with: node -r ts-node/register subscription-manager.test.ts
 */

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`)
  }
}

function assertEqual<T>(actual: T, expected: T, message?: string) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message || ''} - Expected ${expected}, got ${actual}`)
  }
}

// Test subscription registration
export function testSubscriptionRegistration() {
  console.log('🧪 Testing subscription registration...')

  const mockUserContext = { user: { id: 'user1' } } as any

  registerIncrementalSubscription(
    'test-query-1',
    'user1',
    'tasks',
    { where: { status: 'active' }, limit: 10 },
    mockUserContext,
  )

  const subscription = getIncrementalSubscription('test-query-1')
  assert(subscription !== undefined, 'Subscription should be registered')
  assertEqual(subscription?.userId, 'user1', 'User ID should match')
  assertEqual(subscription?.collection, 'tasks', 'Collection should match')
  assertEqual(subscription?.limit, 10, 'Limit should match')

  console.log('✅ Subscription registration test passed')
}

// Test count subscriptions
export function testCountSubscriptions() {
  console.log('🧪 Testing count subscriptions...')

  registerCountSubscription('count-query-1', 'tasks', {
    where: { status: 'completed' },
    locale: 'en',
  })

  const subscriptions = getCountSubscriptionsForCollection('tasks')
  assertEqual(subscriptions.length, 1, 'Should have one count subscription')
  assertEqual(subscriptions[0].queryKey, 'count-query-1', 'Query key should match')

  console.log('✅ Count subscription test passed')
}

// Test subscription statistics
export function testSubscriptionStats() {
  console.log('🧪 Testing subscription statistics...')

  const mockUserContext = { user: { id: 'user1' } } as any

  registerIncrementalSubscription('inc1', 'user1', 'tasks', {}, mockUserContext)
  registerCountSubscription('count1', 'tasks', {})

  const stats = getSubscriptionStats()
  assert(stats.incremental >= 1, 'Should have at least 1 incremental subscription')
  assert(stats.count >= 1, 'Should have at least 1 count subscription')
  assert(stats.total >= 2, 'Total should be sum of both types')

  console.log('✅ Subscription stats test passed')
}

// Run all tests
export function runAllTests() {
  console.log('🚀 Running subscription manager tests...')

  try {
    testSubscriptionRegistration()
    testCountSubscriptions()
    testSubscriptionStats()

    console.log('🎉 All subscription manager tests passed!')
  } catch (error) {
    console.error('❌ Test failed:', error)
    throw error
  }
}

// Auto-run tests if this file is executed directly
if (require.main === module) {
  runAllTests()
}
