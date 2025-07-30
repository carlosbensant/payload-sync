import type { CollectionConfig } from 'payload'
import { readAccess } from './access/read'
import { updateAccess } from './access/update'

// Fields
export const UserFields: CollectionConfig['fields'] = [
  {
    name: 'username',
    type: 'text',
    required: true,
    // That's what we need to add to ensure the username is unique, see beforeValidate hook
    unique: true,
    hooks: {
      // beforeValidate: [ensureUniqueUsername],
    },
    index: true,
  },
  {
    name: 'name',
    type: 'text',
    defaultValue: '',
    required: true,
  },
  {
    label: 'First name',
    name: 'first_name',
    type: 'text',
    defaultValue: '',
    required: true,
  },
  {
    label: 'Last name',
    name: 'last_name',
    type: 'text',
    defaultValue: '',
    required: true,
  },
  {
    name: 'position',
    type: 'text',
  },
  {
    name: 'image',
    type: 'upload',
    relationTo: 'media',
    admin: {
      components: {
        Cell: 'src/custom-fields/Thumbnail/Component.tsx',
      },
    },
  },
  {
    name: 'description',
    type: 'richText',
  },
  {
    name: 'mobile',
    type: 'text',
  },
  {
    name: 'phone',
    type: 'text',
  },
  {
    type: 'select',
    name: 'gender',
    options: [
      {
        label: 'Male',
        value: 'male',
      },
      {
        label: 'Female',
        value: 'female',
      },
    ],
  },
  {
    name: 'type',
    type: 'select',
    defaultValue: 'user',
    saveToJWT: true,
    options: [
      { label: 'Admin', value: 'admin' },
      { label: 'User', value: 'user' },
      { label: 'Creator', value: 'creator' },
    ],
    index: true,
  },
  {
    label: 'Workspaces',
    name: 'workspaces',
    type: 'join',
    collection: 'workspaceMemberships',
    on: 'user',
    maxDepth: 1,
    admin: {
      defaultColumns: ['workspace', 'role'],
    },
  },
]

const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'email'],
  },
  access: {
    read: readAccess,
    // create: anyone,
    update: updateAccess,
    // delete: admins,
    // admin: ({ req: { user } }) => checkRole(['admin'], user),
  },
  auth: {
    tokenExpiration: 28800, // 8 hours
    cookies: {
      secure: true,
      domain: process.env.PAYLOAD_PUBLIC_SITE_DOMAIN,
      sameSite: 'Lax',
    },
  },
  fields: UserFields,
  timestamps: true,
}

export { Users }
