import { CollectionConfig } from 'payload'
import { createAccess } from './access/create'
import { readAccess } from './access/read'
import type { Workspace } from '@/payload-types'

export const WorkspaceFields: CollectionConfig['fields'] = [
  {
    name: 'name',
    type: 'text',
    required: true,
  },
  {
    name: 'slug',
    type: 'text',
    unique: true,
    required: true,
    index: true,
  },
  {
    name: 'image',
    type: 'upload',
    relationTo: 'media',
  },
  {
    label: 'Members',
    name: 'members',
    type: 'join',
    collection: 'workspaceMemberships',
    on: 'workspace',
    hasMany: true,
  },
]

const Workspaces: CollectionConfig = {
  slug: 'workspaces',
  admin: {
    useAsTitle: 'name',
  },
  fields: WorkspaceFields,
  timestamps: true,
  hooks: {
    afterOperation: [
      async ({ req, operation, result }) => {
        try {
          if (operation === 'create') {
            const user = req.user
            if (user) {
              const workspace = result as Workspace

              console.log('🦾 Creating Workspace default user "admin" membership')
              await req.payload.create({
                req,
                overrideAccess: false,
                collection: 'workspaceMemberships',
                data: {
                  user: user.id,
                  workspace: workspace.id,
                  role: 'admin',
                },
              })
            }
          }
          return result
        } catch (error) {
          console.error('❌ Error in workspace afterOperation hook', error)
        }
      },
    ],
  },
  access: {
    create: createAccess,
    read: readAccess,
  },
}

export { Workspaces }
