import type { FieldHook } from 'payload'

import { ValidationError } from 'payload'

import { getWorkspaceAccessIDs } from '@/utilities/get-workspace-access-ids'

export const ensureUniqueUsername: FieldHook = async ({ req, data, originalDoc, value }) => {
  // if value is unchanged, skip validation
  if (originalDoc.username === value) {
    return value
  }

  const incomingWorkspaceID: string =
    typeof data?.workspace === 'object' ? data.workspace.id : data?.workspace
  const currentWorkspaceID: string =
    typeof originalDoc?.workspace === 'object' ? originalDoc.workspace.id : originalDoc?.workspace
  const workspaceIDToMatch = incomingWorkspaceID || currentWorkspaceID

  if (!workspaceIDToMatch) {
    return value
  }

  // @TODO: Update this to use the new workspace access IDs utility
  const findDuplicateUsers = await req.payload.find({
    collection: 'users',
    where: {
      and: [
        {
          'workspaces.workspace': {
            equals: workspaceIDToMatch,
          },
        },
        {
          username: {
            equals: value,
          },
        },
      ],
    },
  })

  if (findDuplicateUsers.docs.length > 0 && req.user) {
    const workspaceIDs = getWorkspaceAccessIDs(req.user)
    // if the user is an admin or has access to more than 1 workspace
    // provide a more specific error message
    if (req.user.type === 'admin' || workspaceIDs.length > 1) {
      const attemptedWorkspaceChange = await req.payload.findByID({
        id: workspaceIDToMatch,
        collection: 'workspaces',
      })

      throw new ValidationError({
        errors: [
          {
            message: `The "${attemptedWorkspaceChange.name}" workspace already has a user with the username "${value}". Usernames must be unique per workspace.`,
            path: 'username',
          },
        ],
      })
    }

    throw new ValidationError({
      errors: [
        {
          message: `A user with the username ${value} already exists. Usernames must be unique per workspace.`,
          path: 'username',
        },
      ],
    })
  }

  return value
}
