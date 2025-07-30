import { CollectionConfig } from 'payload'

export const Tasks: CollectionConfig = {
  slug: 'tasks',
  labels: {
    singular: 'Task',
    plural: 'Tasks',
  },
  admin: {
    useAsTitle: 'name',
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'content',
      type: 'text',
    },
    {
      name: 'project',
      type: 'relationship',
      relationTo: 'projects',
    },
    {
      name: 'author',
      type: 'relationship',
      relationTo: 'users',
    },
    {
      name: 'status',
      type: 'select',
      options: [
        {
          label: 'Backlog',
          value: 'backlog',
        },
        {
          label: 'To Do',
          value: 'todo',
        },
        {
          label: 'In Progress',
          value: 'in-progress',
        },
        {
          label: 'In Review',
          value: 'in-review',
        },
        {
          label: 'Done',
          value: 'done',
        },
      ],
      defaultValue: 'todo',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'assignee',
      type: 'relationship',
      relationTo: 'users',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'dueAt',
      type: 'date',
      admin: {
        position: 'sidebar',
      },
    },
  ],
  timestamps: true,
}
