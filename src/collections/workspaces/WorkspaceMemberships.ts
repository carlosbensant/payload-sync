import type { CollectionConfig } from 'payload'

export const WorkspaceMemberships: CollectionConfig = {
  slug: 'workspaceMemberships',
  // access: {
  //   read: ({ req }: AccessArgs) => ({ user: { equals: req.user?.id } }) as AccessResult,
  //   create: ({ req }: AccessArgs) => !!req.user as AccessResult,
  //   update: ({ req }: AccessArgs) => ({ user: { equals: req.user?.id } }) as AccessResult,
  //   delete: ({ req }: AccessArgs) => ({ user: { equals: req.user?.id } }) as AccessResult,
  // },
  admin: {
    useAsTitle: 'user',
    defaultColumns: ['user', 'stream', 'role'],
  },
  fields: [
    {
      name: 'workspace',
      type: 'relationship',
      relationTo: 'workspaces',
      required: true,
    },
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
    },
    {
      name: 'role',
      type: 'select',
      required: true,
      options: [
        { label: 'Admin', value: 'admin' },
        { label: 'User', value: 'user' },
      ],
      defaultValue: 'user',
      index: true,
    },
    {
      name: 'metadata',
      type: 'json',
      admin: {
        description: 'Optional custom metadata',
      },
    },
  ],
  timestamps: true,
}
