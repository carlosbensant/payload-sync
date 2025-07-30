import type { Access } from 'payload'

import type { User } from '@/payload-types'

export const createAccess: Access<User> = ({ req }) => {
  if (!req.user) {
    return false
  }

  return true
}
