import type { Workspace, User } from '../payload-types'
import { extractID } from './extract-id'

// export const getWorkspaceAccessIDs = (workspaces: Workspace[], user: null | User): Workspace['id'][] => {
//   if (!user || !workspaces) {
//     return []
//   }

//   return (
//     workspaces.members.reduce<Workspace['id'][]>((acc, { members }) => {
//       if (member) {
//         acc.push(extractID(member.user))
//       }
//       return acc
//     }, []) || []
//   )
// }

export const getUserWorkspaceIDs = (workspaces: Workspace[], user: null | User, role?: "admin" | "user"): Workspace['id'][] => {
  if (!user || !user.workspaces) {
    return []
  }

  return (
    workspaces.flatMap(w => w.members || []).reduce<Workspace['id'][]>((acc, { user, roles }) => {
      if (role && !roles.includes(role)) {
        return acc
      }

      if (user) {
        acc.push(extractID(user))
      }

      return acc
    }, []) || []
  )
}
