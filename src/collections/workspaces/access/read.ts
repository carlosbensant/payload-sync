import type { Workspace } from '@/payload-types'
import type { Access, Where } from 'payload'

import { isSuperAdmin } from '../users/access/isSuperAdmin'

export const readAccess: Access<Workspace> = ({ req }) => {
  const user = req.user

  if (!user) {
    return false
  }

  if (isSuperAdmin(user)) {
    return true
  }

  // const workspaces = await req.payload.find({
  //   collection: 'workspaces',
  //   select: { members: true },
  //   where: {

  //   },
  //   depth: 0,
  // })

  // const members = workspaces.docs.flatMap((w) => w.members || [])

  return {
    or: [
      {
        'members.user': {
          equals: user.id,
        },
      },
    ],
  } as Where
}
