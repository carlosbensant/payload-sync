import { subscribeToQuery, subscribeToCount } from '../subscription-manager'

/**
 * Simple test runner for smart publisher
 */

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`)
  }
}

// Test subscription functions
export function testSubscriptionFunctions() {
  console.log('🧪 Testing subscription functions...')

  try {
    // Test query subscription
    subscribeToQuery('clientId', 'test-query', 'tasks', { where: { status: 'active' } })

    // Test count subscription
    subscribeToCount('clientId', 'count-query', 'tasks', { where: { status: 'active' } })

    console.log('✅ Subscription functions test passed')
  } catch (error) {
    console.error('❌ Subscription functions test failed:', error)
    throw error
  }
}

// Test function exports
export function testFunctionExports() {
  console.log('🧪 Testing function exports...')

  assert(typeof subscribeToQuery === 'function', 'subscribeToQuery should be a function')
  assert(typeof subscribeToCount === 'function', 'subscribeToCount should be a function')

  console.log('✅ Function exports test passed')
}

// Test parameter validation
export function testParameterValidation() {
  console.log('🧪 Testing parameter validation...')

  try {
    // Should not throw with valid parameters
    subscribeToQuery('clientId', 'valid-query', 'tasks', {})
    subscribeToCount('clientId', 'valid-count', 'tasks', {})

    console.log('✅ Parameter validation test passed')
  } catch (error) {
    console.error('❌ Parameter validation test failed:', error)
    throw error
  }
}

// Run all tests
export async function runAllTests() {
  console.log('🚀 Running smart publisher tests...')

  try {
    testFunctionExports()
    testSubscriptionFunctions()
    testParameterValidation()

    console.log('🎉 All smart publisher tests passed!')
  } catch (error) {
    console.error('❌ Test failed:', error)
    throw error
  }
}

// Auto-run tests if this file is executed directly
if (require.main === module) {
  runAllTests()
}
