import type { Access, FieldAccess } from 'payload'
import { type User } from '@/payload-types'

export const isSuperAdmin = (user: User): boolean => {
  return Boolean(user.type === 'admin')
}

export const isSuperAdminFieldAccess: FieldAccess = ({ req }): boolean => {
  if (!req.user) return false
  return isSuperAdmin(req.user)
}

export const isSuperAdminAccess: Access<User> = ({ req }): boolean => {
  if (!req.user) return false
  return isSuperAdmin(req.user)
}
