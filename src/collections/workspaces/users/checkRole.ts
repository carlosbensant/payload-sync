import type { User } from '@/payload-types'

export const checkRole = (allRoles: string[] = [], user?: User): boolean => {
  if (user) {
    if (
      allRoles?.some((role) => {
        return user?.roles?.some((individualRole) => {
          return individualRole === role
        })
      })
    )

    return true
  }

  return false
}
