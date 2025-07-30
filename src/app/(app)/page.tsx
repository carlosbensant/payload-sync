'use client'

import Image from 'next/image'
import React from 'react'

import {
  usePayloadQuery,
  PayloadQueryProvider,
  usePayloadMutation,
  createMutationFn,
  updateMutationFn,
  deleteMutationFn,
  optimisticCreateUpdate,
  optimisticUpdateUpdate,
  optimisticDeleteUpdate,
} from '@/plugins/payload-sync/src/client'
import './styles.css'

const PROJECT_ID = '9e6ad778-4d24-49f6-b892-f734c4039f49'

function CreateTaskForm() {
  const [taskName, setTaskName] = React.useState('')

  const createTask = usePayloadMutation({
    mutationFn: createMutationFn<any>('tasks'),
    optimisticUpdate: optimisticCreateUpdate({
      type: 'find',
      collection: 'tasks',
      where: { project: { equals: PROJECT_ID } },
      sort: '-createdAt',
      limit: 10,
      populate: {
        assignee: true,
      },
    }),
    onSuccess: (result) => {
      console.log('✅ Task created successfully:', result)
      setTaskName('') // Clear form
    },
    onError: (error) => {
      console.error('❌ Failed to create task:', error)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!taskName.trim()) return

    createTask.mutate({
      name: taskName,
      status: 'in-progress',
      project: PROJECT_ID,
      content: `Task created at ${new Date().toLocaleString()}`,
    })
  }

  return (
    <div className="create-task-form">
      <h3>🚀 Create New Task (with Optimistic Updates)</h3>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <input
            type="text"
            value={taskName}
            onChange={(e) => setTaskName(e.target.value)}
            placeholder="Enter task name..."
            disabled={createTask.isPending}
            className="task-input"
          />
          <button
            type="submit"
            disabled={createTask.isPending || !taskName.trim()}
            className="create-button"
          >
            {createTask.isPending ? '⏳ Creating...' : '➕ Create Task'}
          </button>
        </div>
      </form>

      {createTask.isError && <div className="error">❌ Error: {createTask.error?.message}</div>}

      {createTask.isSuccess && (
        <div className="success">
          ✅ Task created successfully! Watch it appear instantly above.
        </div>
      )}
    </div>
  )
}

function TaskItem({ task }: { task: any }) {
  const [isEditing, setIsEditing] = React.useState(false)
  const [editName, setEditName] = React.useState(task.name)

  const updateTask = usePayloadMutation({
    mutationFn: updateMutationFn<any>('tasks'),
    optimisticUpdate: optimisticUpdateUpdate({
      type: 'find',
      collection: 'tasks',
      where: { project: { equals: PROJECT_ID } },
      sort: '-createdAt',
      limit: 10,
      populate: {
        project: true,
        assignee: true,
      },
    }),
    onSuccess: () => {
      console.log('✅ Task updated successfully')
      setIsEditing(false)
    },
    onError: (error) => {
      console.error('❌ Failed to update task:', error)
      setEditName(task.name) // Reset on error
    },
  })

  const deleteTask = usePayloadMutation({
    mutationFn: deleteMutationFn('tasks'),
    optimisticUpdate: optimisticDeleteUpdate({
      type: 'find',
      collection: 'tasks',
      where: { project: { equals: PROJECT_ID } },
      sort: '-createdAt',
      limit: 10,
      populate: {
        project: true,
        assignee: true,
      },
    }),
    onSuccess: () => {
      console.log('✅ Task deleted successfully')
    },
    onError: (error) => {
      console.error('❌ Failed to delete task:', error)
    },
  })

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editName.trim()) return

    updateTask.mutate({
      id: task.id,
      data: { name: editName },
    })
  }

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this task?')) {
      deleteTask.mutate(task.id)
    }
  }

  const toggleStatus = () => {
    const newStatus = task.status === 'completed' ? 'in-progress' : 'completed'
    updateTask.mutate({
      id: task.id,
      data: { status: newStatus },
    })
  }

  return (
    <div className={`task-item ${task.status}`}>
      <div className="task-header">
        {isEditing ? (
          <form onSubmit={handleUpdate} className="edit-form">
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              disabled={updateTask.isPending}
              className="edit-input"
            />
            <button type="submit" disabled={updateTask.isPending} className="save-btn">
              {updateTask.isPending ? '⏳' : '💾'}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsEditing(false)
                setEditName(task.name)
              }}
              className="cancel-btn"
            >
              ❌
            </button>
          </form>
        ) : (
          <h3 className="task-name">{task.name}</h3>
        )}

        <div className="task-actions">
          {!isEditing && (
            <button onClick={() => setIsEditing(true)} className="edit-btn" title="Edit task">
              ✏️
            </button>
          )}
          <button
            onClick={toggleStatus}
            disabled={updateTask.isPending}
            className="status-btn"
            title="Toggle status"
          >
            {updateTask.isPending ? '⏳' : task.status === 'completed' ? '✅' : '⭕'}
          </button>
          <button
            onClick={handleDelete}
            disabled={deleteTask.isPending}
            className="delete-btn"
            title="Delete task"
          >
            {deleteTask.isPending ? '⏳' : '🗑️'}
          </button>
        </div>
      </div>

      <div className="task-meta">
        <span className={`status status-${task.status}`}>
          {task.status?.replace('-', ' ').toUpperCase()}
        </span>
        {task.assignee && (
          <span className="assignee" title={`Assigned to ${task.assignee.name}`}>
            👤 {task.assignee.name}
          </span>
        )}
        <span className="created-at">{new Date(task.createdAt).toLocaleDateString()}</span>
      </div>

      {task.content && (
        <div className="task-content" dangerouslySetInnerHTML={{ __html: task.content }} />
      )}
    </div>
  )
}

function TasksList() {
  const { data, isLoading, error } = usePayloadQuery(
    {
      type: 'find',
      collection: 'tasks',
      sort: '-createdAt',
      limit: 10,
      populate: {
        project: true,
        assignee: true,
      },
      where: {
        project: {
          equals: PROJECT_ID,
        },
      },
    },
    {
      ttl: 1000 * 60 * 10, // 10 minutes
    },
  )

  if (isLoading) {
    return <div className="loading">Loading tasks...</div>
  }

  if (error) {
    return <div className="error">Error loading tasks: {error.message}</div>
  }

  const tasks = data?.docs || []

  return (
    <div className="tasks-section">
      <h2>📋 Interactive Tasks (Real-time + Mutations)</h2>
      <div className="tasks-count">Total: {data?.totalDocs || 0} tasks</div>

      <CreateTaskForm />

      <div className="tasks-list">
        {tasks.length === 0 ? (
          <p>No tasks found. Create your first task above to see the magic! ✨</p>
        ) : (
          tasks.map((task: any) => <TaskItem key={task.id} task={task} />)
        )}
      </div>
    </div>
  )
}

function TasksCount() {
  const { data, isLoading } = usePayloadQuery(
    {
      type: 'count',
      collection: 'tasks',
      where: {
        project: {
          equals: PROJECT_ID,
        },
      },
    },
    {
      ttl: 1000 * 60 * 10, // 10 minutes
    },
  )

  if (isLoading) {
    return <span>Loading...</span>
  }

  return <span>{data?.totalDocs || 0}</span>
}

function HomePageContent() {
  return (
    <div className="home">
      <div className="content">
        <picture>
          <source srcSet="https://raw.githubusercontent.com/payloadcms/payload/main/packages/ui/src/assets/payload-favicon.svg" />
          <Image
            alt="Payload Logo"
            height={65}
            src="https://raw.githubusercontent.com/payloadcms/payload/main/packages/ui/src/assets/payload-favicon.svg"
            width={65}
          />
        </picture>
        <h1>🚀 Real-time Payload Sync Demo</h1>
        <p>This page demonstrates real-time queries AND mutations with optimistic updates!</p>

        <div className="real-time-demo">
          <div className="demo-section">
            <h3>
              📊 Real-time Task Count: <TasksCount />
            </h3>
            <p>This count updates instantly when you create/delete tasks below!</p>
          </div>

          <TasksList />
        </div>

        <div className="links">
          <a className="admin" href="/admin" rel="noopener noreferrer" target="_blank">
            Go to admin panel
          </a>
          <a
            className="docs"
            href="https://payloadcms.com/docs"
            rel="noopener noreferrer"
            target="_blank"
          >
            Documentation
          </a>
        </div>
      </div>
      <div className="footer">
        <div className="mutation-info">
          <h4>🎯 What you&apos;re seeing:</h4>
          <ul>
            <li>
              ✨ <strong>Optimistic Updates</strong> - Changes appear instantly
            </li>
            <li>
              🔄 <strong>Real-time Sync</strong> - Updates propagate to all clients
            </li>
            <li>
              🛡️ <strong>Automatic Rollback</strong> - Failed mutations are reverted
            </li>
            <li>
              📡 <strong>Single Endpoint</strong> - All operations go through /api/sync
            </li>
          </ul>
          <p>
            Try creating, editing, or deleting tasks above. Open multiple browser tabs to see
            real-time sync in action! Also try the admin panel for server-side changes.
          </p>
        </div>
      </div>
    </div>
  )
}

export default function HomePage() {
  return (
    <PayloadQueryProvider>
      <HomePageContent />
    </PayloadQueryProvider>
  )
}
