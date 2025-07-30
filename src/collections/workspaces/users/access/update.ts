import type { User } from '@/payload-types'
import type { Access, Where } from 'payload'

import { getUserWorkspaceIDs } from '@/utilities/get-workspace-access-ids'
import { isSuperAdmin } from './isSuperAdmin'
import { isAccessingSelf } from './isAccessingSelf'

export const updateAccess: Access<User> = ({ req, id }) => {
  const user = req.user
  if (!user) {
    return false
  }

  if (isSuperAdmin(user)) {
    return true
  }

  if (isAccessingSelf({ id, user })) {
    return true
  }

  const adminWorkspaceAccessIDs = getUserWorkspaceIDs(req.user, 'admin')

  return {
    or: [
      {
        id: {
          equals: user.id,
        },
      },
      {
        'workspaces.workspace': {
          in: adminWorkspaceAccessIDs,
        },
      },
    ],
  } as Where
}
