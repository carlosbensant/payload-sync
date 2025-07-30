import type { User } from '@/payload-types'
import type { Access, Where } from 'payload'

import { isSuperAdmin } from './isSuperAdmin'
import { isAccessingSelf } from './isAccessingSelf'

export const readAccess: Access<User> = async ({ req, id }) => {
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

  const workspaceMemberships = await req.payload.find({
    req,
    collection: 'workspaceMemberships',
    select: { user: true },
    depth: 0,
    user,
    overrideAccess: false,
  })

  return {
    or: [
      {
        id: {
          equals: user.id,
        },
      },
      {
        id: {
          in: workspaceMemberships.docs.map(({ user }) => user),
        },
      },
    ],
  } as Where
}
