'use server'

import { redirect } from 'next/navigation'
import { getPayload } from "payload"
import configPromise from '@payload-config'
import { headers as getHeaders } from 'next/headers'
import { unstable_cache } from 'next/cache'

export async function getWorkspace(idOrSlug: string | undefined) {
  const headers = await getHeaders()
  const payload = await getPayload({ config: configPromise })

  const { user } = await payload.auth({ headers })

  return await unstable_cache(
    async () => {

      if (!user) {
        redirect(`/login`)
      }

      let where = {}
      if (idOrSlug) {
        where = {
          or: [{
            slug: {
              equals: idOrSlug,
            },
          }, {
            id: {
              equals: idOrSlug,
            }
          }]
        }
      }

      const workspaces = await payload.find({
        collection: 'workspaces',
        where,
        limit: 3,
        user,
        overrideAccess: false,
      })

      if (!workspaces.docs.length) {
        redirect('/welcome/workspace-details')
      }

      const workspace = workspaces.docs[0]

      if (!idOrSlug) {
        redirect(`/${workspace.slug}/tasks`)
      }

      return {
        headers,
        workspace,
        workspaceId: workspace.id,
        user,
      }
    },
    [],
    {
      revalidate: 3600,
      tags: ["workspace"],
    }
  )()
}

export async function getWorkspaces() {
  const headers = await getHeaders()
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers })

  // return await unstable_cache(
  //   async () => {
      return payload.find({
        collection: 'workspaces',
        user,
        overrideAccess: false
      })
  //   },
  //   [],
  //   {
  //     revalidate: 3600,
  //     tags: ["workspaces"],
  //   }
  // )()
}
