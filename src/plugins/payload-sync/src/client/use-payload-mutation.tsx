'use client'

import { useState, useCallback, useRef } from 'react'
import { createOptimisticLocalStore, payloadCache } from './shared-cache'
import { executeQuery } from './payload-sync'
import type { PayloadMutationConfig, PayloadMutationResult } from '../types'

// Store rollback functions for mutations
const rollbackFunctions = new Map<string, () => void>()

/**
 * usePayloadMutation - The ultimate mutation hook!
 *
 * Combines the best of:
 * - TanStack Query: Lifecycle hooks, retry logic, familiar API
 * - Convex: LocalStore pattern for clean optimistic updates
 * - Zero Sync: Server-authoritative mutations with automatic rollback
 *
 * @example
 * ```tsx
 * const createTaskMutation = usePayloadMutation({
 *   mutationFn: async (data: { title: string, projectId: string }) => {
 *     return fetch('/api/tasks', {
 *       method: 'POST',
 *       body: JSON.stringify(data)
 *     }).then(res => res.json())
 *   },
 *
 *   // Convex-style optimistic updates
 *   optimisticUpdate: (localStore, { title, projectId }) => {
 *     const existingTasks = localStore.getQuery({
 *       type: 'find',
 *       collection: 'tasks',
 *       where: { project: { equals: projectId } }
 *     }) || { docs: [] }
 *
 *     const optimisticTask = {
 *       id: `temp_${Date.now()}`,
 *       title,
 *       project: projectId,
 *       completed: false,
 *       createdAt: new Date().toISOString()
 *     }
 *
 *     localStore.setQuery({
 *       type: 'find',
 *       collection: 'tasks',
 *       where: { project: { equals: projectId } }
 *     }, {
 *       ...existingTasks,
 *       docs: [...existingTasks.docs, optimisticTask]
 *     })
 *   },
 *
 *   // TanStack Query-style lifecycle hooks
 *   onSuccess: (result, variables) => {
 *     console.log('Task created:', result)
 *   },
 *
 *   // Auto-invalidation
 *   invalidateQueries: [
 *     { type: 'find', collection: 'tasks' },
 *     { type: 'count', collection: 'tasks' }
 *   ]
 * })
 *
 * // Usage
 * createTaskMutation.mutate({ title: 'New task', projectId: 'abc123' })
 * ```
 */
export function usePayloadMutation<TMutationData = any, TResult = any, TError = Error>(
  config: PayloadMutationConfig<TMutationData, TResult, TError>,
): PayloadMutationResult<TMutationData, TResult, TError> {
  // Mutation state - TanStack Query inspired
  const [state, setState] = useState<{
    status: 'idle' | 'pending' | 'success' | 'error'
    isPending: boolean
    isSuccess: boolean
    isError: boolean
    isIdle: boolean
    data: TResult | undefined
    error: TError | undefined
    failureCount: number
    failureReason: TError | undefined
    variables: TMutationData | undefined
  }>({
    status: 'idle',
    isPending: false,
    isSuccess: false,
    isError: false,
    isIdle: true,
    data: undefined,
    error: undefined,
    failureCount: 0,
    failureReason: undefined,
    variables: undefined,
  })

  const contextRef = useRef<any>()
  const failureCountRef = useRef(0)
  const localStore = useRef(createOptimisticLocalStore())

  // Reset mutation state
  const reset = useCallback(() => {
    failureCountRef.current = 0
    setState({
      status: 'idle',
      isPending: false,
      isSuccess: false,
      isError: false,
      isIdle: true,
      data: undefined,
      error: undefined,
      failureCount: 0,
      failureReason: undefined,
      variables: undefined,
    })
    contextRef.current = undefined
  }, [])

  // Execute mutation with full lifecycle
  const executeMutation = useCallback(
    async (mutationData: TMutationData, isRetry: boolean = false): Promise<TResult> => {
      const mutationId = `mutation_${Date.now()}_${Math.random()}`

      try {
        // Update state to pending
        if (isRetry) {
          failureCountRef.current += 1
        }
        setState((prev) => ({
          ...prev,
          status: 'pending',
          isPending: true,
          isSuccess: false,
          isError: false,
          isIdle: false,
          variables: mutationData,
          failureCount: failureCountRef.current,
        }))

        // 1. onMutate lifecycle - TanStack Query pattern
        if (config.onMutate) {
          contextRef.current = await config.onMutate(mutationData)
        }

        // 2. Apply optimistic update - Convex pattern
        if (config.optimisticUpdate) {
          await config.optimisticUpdate(localStore.current, mutationData)

          // Store rollback function for error case
          rollbackFunctions.set(mutationId, () => {
            // Clear optimistic updates from shared cache
            payloadCache.clear()

            // Re-execute invalidated queries to get fresh data
            if (config.invalidateQueries) {
              config.invalidateQueries.forEach((query) => {
                executeQuery(query).catch(console.error)
              })
            }
          })
        }

        // 3. Execute server mutation - Zero Sync inspired server-authoritative
        const result = await config.mutationFn(mutationData)

        // 4. Success state
        setState((prev) => ({
          ...prev,
          status: 'success',
          isPending: false,
          isSuccess: true,
          isError: false,
          data: result,
          error: undefined,
        }))

        // 5. Clear optimistic updates (server data is authoritative)
        // Note: We don't clear the entire cache here, just remove the rollback
        rollbackFunctions.delete(mutationId)

        // 6. Auto-invalidate queries to get fresh server data
        if (config.invalidateQueries) {
          config.invalidateQueries.forEach((query) => {
            localStore.current.invalidateQuery(query)
          })
        }

        // 7. onSuccess lifecycle
        if (config.onSuccess) {
          await config.onSuccess(result, mutationData, contextRef.current)
        }

        // 8. onSettled lifecycle
        if (config.onSettled) {
          await config.onSettled(result, null, mutationData, contextRef.current)
        }

        return result
      } catch (error) {
        const mutationError = error as TError

        // Rollback optimistic updates
        const rollback = rollbackFunctions.get(mutationId)
        if (rollback) {
          rollback()
          rollbackFunctions.delete(mutationId)
        }

        // Check if we should retry
        const shouldRetry =
          config.retry !== false &&
          (typeof config.retry === 'number'
            ? failureCountRef.current < config.retry
            : failureCountRef.current < 3)

        if (shouldRetry) {
          // Calculate retry delay
          const delay =
            typeof config.retryDelay === 'function'
              ? config.retryDelay(state.failureCount + 1)
              : config.retryDelay || 1000 * Math.pow(2, state.failureCount) // Exponential backoff

          console.log(state, 'shouldRetry: state')
          setTimeout(() => {
            executeMutation(mutationData, true).catch(() => {
              // Final retry failed, handle as error
            })
          }, delay)

          return Promise.reject(mutationError)
        }

        // Update error state
        failureCountRef.current += 1
        setState((prev) => ({
          ...prev,
          status: 'error',
          isPending: false,
          isSuccess: false,
          isError: true,
          error: mutationError,
          failureReason: mutationError,
          failureCount: failureCountRef.current,
        }))

        // onError lifecycle
        if (config.onError) {
          await config.onError(mutationError, mutationData, contextRef.current)
        }

        // onSettled lifecycle
        if (config.onSettled) {
          await config.onSettled(undefined, mutationError, mutationData, contextRef.current)
        }

        throw mutationError
      }
    },
    [config, state],
  )

  // Fire-and-forget mutation (Convex style)
  const mutate = useCallback(
    (data: TMutationData) => {
      executeMutation(data).catch((error) => {
        // Error is already handled in executeMutation
        console.error('Mutation failed:', error)
      })
    },
    [executeMutation],
  )

  // Promise-based mutation (TanStack Query style)
  const mutateAsync = useCallback(
    (data: TMutationData): Promise<TResult> => {
      return executeMutation(data)
    },
    [executeMutation],
  )

  return {
    ...state,
    mutate,
    mutateAsync,
    reset,
  }
}
