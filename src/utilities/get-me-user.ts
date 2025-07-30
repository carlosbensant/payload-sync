import { cookies } from 'next/headers'
import { getPayload } from './get-payload'
import { User } from '@/payload-types'

export const getMeUser = async () => {
  const cookieStore = await cookies()
  const token = cookieStore.get('payload-token')

  if (!token) {
    return { user: null }
  }

  const payload = await getPayload()
  const { user } = await payload.auth.me({ token: token.value })

  return { user: user as User }
}
