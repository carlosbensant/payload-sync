# Payload Sync Plugin

A real-time sync plugin for PayloadCMS that provides reactive queries and optimistic mutations.

## Features

- 🔄 **Real-time sync** - Automatic updates across all connected clients
- ⚡ **Optimistic updates** - Instant UI updates with server reconciliation
- 🎯 **Type-safe** - Full TypeScript support with PayloadCMS types
- 🚀 **Zero config** - Works out of the box with PayloadCMS
- 🔧 **Flexible** - Supports any backend architecture

## Quick Start

### 1. Setup the Plugin

```typescript
// payload.config.ts
import { payloadSync } from './plugins/payload-sync'

export default buildConfig({
  plugins: [payloadSync()],
  // ... rest of config
})
```

### 2. Use Real-time Queries

```tsx
import { usePayloadQuery } from '@/plugins/payload-sync'

function TaskList({ projectId }: { projectId: string }) {
  const {
    data: tasks,
    loading,
    error,
  } = usePayloadQuery({
    type: 'find',
    collection: 'tasks',
    where: { project: { equals: projectId } },
    sort: '-createdAt',
    limit: 20,
  })

  if (loading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>

  return <div>{tasks?.docs?.map((task) => <TaskItem key={task.id} task={task} />)}</div>
}
```

### 3. Use Optimistic Mutations

Our mutation system combines the best of **TanStack Query**, **Convex**, and **Zero Sync**:

```tsx
import { usePayloadMutation } from '@/plugins/payload-sync'

function CreateTaskForm({ projectId }: { projectId: string }) {
  const createTask = usePayloadMutation({
    // Server mutation function (required)
    mutationFn: async (data: { title: string; projectId: string }) => {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      return response.json()
    },

    // Convex-style optimistic updates (optional)
    optimisticUpdate: (localStore, { title, projectId }) => {
      // Get current tasks
      const existingTasks = localStore.getQuery({
        type: 'find',
        collection: 'tasks',
        where: { project: { equals: projectId } },
      }) || { docs: [] }

      // Create optimistic task
      const optimisticTask = {
        id: `temp_${Date.now()}`,
        title,
        project: projectId,
        completed: false,
        createdAt: new Date().toISOString(),
      }

      // Update local cache immediately
      localStore.setQuery(
        {
          type: 'find',
          collection: 'tasks',
          where: { project: { equals: projectId } },
        },
        {
          ...existingTasks,
          docs: [...existingTasks.docs, optimisticTask],
        },
      )
    },

    // TanStack Query-style lifecycle hooks (optional)
    onSuccess: (result, variables) => {
      console.log('Task created successfully:', result)
      // Could trigger analytics, notifications, etc.
    },

    onError: (error, variables) => {
      console.error('Failed to create task:', error)
      // Could show error toast, etc.
    },

    // Auto-invalidation (optional)
    invalidateQueries: [
      { type: 'find', collection: 'tasks' },
      { type: 'count', collection: 'tasks' },
    ],

    // Retry configuration (optional)
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30000),
  })

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const title = formData.get('title') as string

    // Fire-and-forget mutation (Convex style)
    createTask.mutate({ title, projectId })

    // OR promise-based (TanStack Query style)
    // createTask.mutateAsync({ title, projectId })
    //   .then(result => console.log('Success:', result))
    //   .catch(error => console.error('Error:', error))
  }

  return (
    <form onSubmit={handleSubmit}>
      <input name="title" placeholder="Task title" disabled={createTask.isPending} />
      <button type="submit" disabled={createTask.isPending}>
        {createTask.isPending ? 'Creating...' : 'Create Task'}
      </button>

      {createTask.isError && <div className="error">Error: {createTask.error?.message}</div>}
    </form>
  )
}
```

## Advanced Examples

### Complex Optimistic Updates

```tsx
const updateTaskMutation = usePayloadMutation({
  mutationFn: async ({ id, data }: { id: string; data: Partial<Task> }) => {
    return fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then((res) => res.json())
  },

  optimisticUpdate: (localStore, { id, data }) => {
    // Update single task query
    const singleTask = localStore.getQuery({
      type: 'findByID',
      collection: 'tasks',
      id,
    })

    if (singleTask) {
      localStore.setQuery(
        {
          type: 'findByID',
          collection: 'tasks',
          id,
        },
        { ...singleTask, ...data },
      )
    }

    // Update task list queries
    const taskList = localStore.getQuery({
      type: 'find',
      collection: 'tasks',
      where: { project: { equals: singleTask?.project } },
    })

    if (taskList) {
      localStore.setQuery(
        {
          type: 'find',
          collection: 'tasks',
          where: { project: { equals: singleTask?.project } },
        },
        {
          ...taskList,
          docs: taskList.docs.map((task) => (task.id === id ? { ...task, ...data } : task)),
        },
      )
    }
  },
})
```

### Rollback on Error

```tsx
const deleteTaskMutation = usePayloadMutation({
  mutationFn: async (taskId: string) => {
    return fetch(`/api/tasks/${taskId}`, { method: 'DELETE' })
  },

  onMutate: async (taskId) => {
    // Store original task for potential rollback
    const originalTask = localStore.getQuery({
      type: 'findByID',
      collection: 'tasks',
      id: taskId,
    })

    return { originalTask }
  },

  optimisticUpdate: (localStore, taskId) => {
    // Optimistically remove from list
    const taskList = localStore.getQuery({
      type: 'find',
      collection: 'tasks',
    })

    if (taskList) {
      localStore.setQuery(
        {
          type: 'find',
          collection: 'tasks',
        },
        {
          ...taskList,
          docs: taskList.docs.filter((task) => task.id !== taskId),
        },
      )
    }
  },

  onError: (error, taskId, context) => {
    // Automatic rollback happens, but you can do additional cleanup
    console.error('Delete failed, task restored:', context?.originalTask)
  },
})
```

## API Reference

### usePayloadQuery

```typescript
function usePayloadQuery<T>(query: PayloadQuery): {
  data: T | undefined
  loading: boolean
  error: Error | null
}
```

### usePayloadMutation

```typescript
function usePayloadMutation<TMutationData, TResult, TError>(
  config: PayloadMutationConfig<TMutationData, TResult, TError>,
): PayloadMutationResult<TMutationData, TResult, TError>
```

#### PayloadMutationConfig

```typescript
interface PayloadMutationConfig<TMutationData, TResult, TError> {
  // Required: Server mutation function
  mutationFn: (data: TMutationData) => Promise<TResult>

  // Optional: Convex-style optimistic updates
  optimisticUpdate?: (localStore: OptimisticLocalStore, data: TMutationData) => void

  // Optional: TanStack Query-style lifecycle hooks
  onMutate?: (data: TMutationData) => void | Promise<{ rollback?: () => void }>
  onSuccess?: (result: TResult, data: TMutationData, context?: any) => void
  onError?: (error: TError, data: TMutationData, context?: any) => void
  onSettled?: (
    result: TResult | undefined,
    error: TError | null,
    data: TMutationData,
    context?: any,
  ) => void

  // Optional: Auto-invalidation
  invalidateQueries?: PayloadQuery[]

  // Optional: Retry configuration
  retry?: number | boolean
  retryDelay?: number | ((attempt: number) => number)
}
```

#### PayloadMutationResult

```typescript
interface PayloadMutationResult<TMutationData, TResult, TError> {
  // State
  status: 'idle' | 'pending' | 'success' | 'error'
  isPending: boolean
  isSuccess: boolean
  isError: boolean
  isIdle: boolean
  data?: TResult
  error?: TError
  variables?: TMutationData

  // Actions
  mutate: (data: TMutationData) => void
  mutateAsync: (data: TMutationData) => Promise<TResult>
  reset: () => void
}
```

## Why This Approach?

Our mutation system combines the best patterns from the leading libraries:

### 🏆 **From TanStack Query**

- **Lifecycle hooks** for flexible side effects
- **Retry logic** with exponential backoff
- **Familiar API** that developers already know

### 🏆 **From Convex**

- **LocalStore pattern** for clean optimistic updates
- **Fire-and-forget mutations** for responsive UIs
- **Automatic rollback** when mutations fail

### 🏆 **From Zero Sync**

- **Server-authoritative** mutations ensure consistency
- **Real-time sync** across all connected clients
- **Type-safe** mutations with full TypeScript support

### ✨ **The Result**

- **Best-in-class DX** - Easy to use, hard to misuse
- **Production-ready** - Handles edge cases and errors gracefully
- **Highly performant** - Optimistic updates + efficient caching
- **Backend agnostic** - Works with any server architecture

## Migration Guide

### From TanStack Query

```tsx
// Before (TanStack Query)
const mutation = useMutation({
  mutationFn: createTask,
  onMutate: async (newTask) => {
    await queryClient.cancelQueries(['tasks'])
    const previousTasks = queryClient.getQueryData(['tasks'])
    queryClient.setQueryData(['tasks'], (old) => [...old, newTask])
    return { previousTasks }
  },
  onError: (err, newTask, context) => {
    queryClient.setQueryData(['tasks'], context.previousTasks)
  },
  onSettled: () => {
    queryClient.invalidateQueries(['tasks'])
  },
})

// After (Payload Sync)
const mutation = usePayloadMutation({
  mutationFn: createTask,
  optimisticUpdate: (localStore, newTask) => {
    const existingTasks = localStore.getQuery({
      type: 'find',
      collection: 'tasks',
    }) || { docs: [] }

    localStore.setQuery(
      {
        type: 'find',
        collection: 'tasks',
      },
      {
        ...existingTasks,
        docs: [...existingTasks.docs, newTask],
      },
    )
  },
  invalidateQueries: [{ type: 'find', collection: 'tasks' }],
})
```

Much cleaner, type-safe, and less error-prone! 🎉

## 🚀 New: Integrated Mutation System

The mutation system now uses the same `/api/sync` endpoint as queries, providing seamless integration:

### Helper Functions

For common operations, use our pre-built helpers:

```tsx
import {
  usePayloadMutation,
  createMutationFn,
  updateMutationFn,
  deleteMutationFn,
  optimisticCreateUpdate,
  optimisticUpdateUpdate,
  optimisticDeleteUpdate,
} from '@/plugins/payload-sync'

// Create Task
const createTask = usePayloadMutation({
  mutationFn: createMutationFn<Task>('tasks'),
  optimisticUpdate: optimisticCreateUpdate(
    'tasks',
    { project: { equals: projectId } },
    '-createdAt',
  ),
  invalidateQueries: [
    { type: 'find', collection: 'tasks' },
    { type: 'count', collection: 'tasks' },
  ],
})

// Update Task
const updateTask = usePayloadMutation({
  mutationFn: updateMutationFn<Task>('tasks'),
  optimisticUpdate: optimisticUpdateUpdate(
    'tasks',
    { project: { equals: projectId } },
    '-createdAt',
  ),
})

// Delete Task
const deleteTask = usePayloadMutation({
  mutationFn: deleteMutationFn('tasks'),
  optimisticUpdate: optimisticDeleteUpdate(
    'tasks',
    { project: { equals: projectId } },
    '-createdAt',
  ),
})

// Usage
createTask.mutate({ title: 'New Task', project: projectId })
updateTask.mutate({ id: 'task-123', data: { completed: true } })
deleteTask.mutate('task-123')
```

### Shared Cache Integration

Mutations now integrate seamlessly with queries through a shared cache:

- ✅ **Instant UI updates** - Optimistic updates appear immediately
- ✅ **Automatic rollback** - Failed mutations are automatically reverted
- ✅ **Zero configuration** - Works out of the box with existing queries
- ✅ **Real-time sync** - Server changes propagate to all clients

```tsx
function TaskApp() {
  // This query will automatically update when mutations run
  const { data: tasks } = usePayloadQuery({
    type: 'find',
    collection: 'tasks',
    sort: '-createdAt',
  })

  // This mutation will instantly update the query above
  const createTask = usePayloadMutation({
    mutationFn: createMutationFn<Task>('tasks'),
    optimisticUpdate: optimisticCreateUpdate('tasks', undefined, '-createdAt'),
  })

  return (
    <div>
      {/* Tasks list updates instantly when createTask.mutate() is called */}
      {tasks?.docs?.map((task) => <TaskItem key={task.id} task={task} />)}

      <button onClick={() => createTask.mutate({ title: 'New Task' })}>Add Task</button>
    </div>
  )
}
```

### Architecture Benefits

1. **Single Endpoint** - All operations go through `/api/sync`
2. **Consistent API** - Same patterns for queries and mutations
3. **Shared Cache** - Optimistic updates integrate seamlessly
4. **Real-time Sync** - Server changes broadcast to all clients
5. **Type Safety** - Full TypeScript support throughout

This creates the most seamless real-time experience possible! 🎉
