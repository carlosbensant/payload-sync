import type { Access, Where } from 'payload'

import { isSuperAdmin } from './isSuperAdmin'

const adminsAndUser: Access = async ({ req }) => {
  const user = req.user
  if (!user) {
    return false
  }

  if (isSuperAdmin(user)) {
    return true
  }

  // if (checkRole(['admin'], user)) {
  //   return true
  // }
  const workspaces = await req.payload.find({
    req,
    collection: 'workspaces',
    where: {
      'members.user': {
        in: user.id,
      },
    },
    select: { members: true },
    depth: 0,
    user: user,
    overrideAccess: false,
  })
  const members = workspaces.docs
    .flatMap((w) => w.members || [])
    .filter((m) => m !== undefined)
    .map((m) => (typeof m === 'object' ? (typeof m.user === 'object' ? m.user.id : m.user) : null))
    .filter((m) => m !== null)

  const query = {
    or: [
      {
        id: {
          equals: user.id,
        },
      },
    ],
  } as Where

  if (members.length > 0) {
    query.or?.push({
      id: {
        in: members.map((m) => m),
      },
    })
  }

  return query
}

export default adminsAndUser
