import { type Endpoint } from 'payload'

import { createQueryHash } from '../utilities/query-hash'
import { subscribeToQuery, subscribeToCount } from './subscription-manager'

import { registry } from '../actors/registry'

type Client = {
  clientId: string
  response: Response
  writer: WritableStreamDefaultWriter
}
export const clients = new Map<string, Client>()

// Global Actor instance for the plugin
let subscriptionsActor: any | null = null

// Initialize Actor instance (called once per plugin initialization)
export function initializeActor(): any {
  if (!subscriptionsActor) {
    const { client } = registry.createServer({
      cors: {
        origin: '*',
      },
    })
    subscriptionsActor = client.subscriptions.getOrCreate()
  }

  return subscriptionsActor
}

// Get the initialized Actor instance
export function getSubscriptions() {
  if (!subscriptionsActor) {
    throw new Error(
      'Subscriptions Actor instance not initialized. Make sure the plugin is properly configured.',
    )
  }
  return subscriptionsActor
}

export function createEndpoints() {
  const payloadQueryEndpoint: Endpoint = {
    handler: async (req) => {
      try {
        const subscriptions = getSubscriptions()
        console.log(subscriptions, 'subscriptions')
        const activeSessions = await subscriptions.getSessions()
        console.log(activeSessions, 'subscription - activeSessions')

        for (const { session } of activeSessions) {
          console.log(session, 'endpoint - session')
        }
        console.log('Payload query endpoint called')

        if (!req.json) {
          console.error('req.json is not a function')
          return new Response('req.json is not a function', { status: 500 })
        }

        const body = await req.json()
        // console.log('Request body:', JSON.stringify(body, null, 2))

        const {
          type,
          clientId,
          collection,
          where,
          sort,
          limit,
          page,
          depth,
          populate,
          locale,
          fallbackLocale,
          id,
          data, // For create/update mutations
        } = body

        if (!type || !collection || !clientId) {
          console.error('Missing required parameters:', {
            type,
            collection,
            clientId,
          })
          throw new Error('Missing required parameters')
        }
        if (!clients.has(clientId)) {
          throw new Error(`Client not found: ${clientId}`)
        }

        // Validate mutation-specific requirements
        if (type === 'create' && !data) {
          throw new Error('Missing data for create mutation')
        }
        if ((type === 'update' || type === 'delete') && !id) {
          throw new Error('Missing id for update/delete mutation')
        }
        if (type === 'update' && !data) {
          throw new Error('Missing data for update mutation')
        }

        console.log('Executing query:', {
          type,
          collection,
          data,
          where,
          sort,
          limit,
          page,
          depth,
          populate,
          locale,
          fallbackLocale,
          id,
        })

        // Create query hash for deduplication (excluding clientId)
        const queryKey = createQueryHash({
          type,
          collection,
          where,
          sort,
          limit,
          page,
          depth,
          populate,
          locale,
          fallbackLocale,
          id,
        })

        // Register session-based subscription
        const userId = req.user?.id || 'anonymous'

        // Add session ID to request context for session tracking
        ;(req as any).clientId = clientId

        if (type === 'count') {
          // Register count subscription for count queries
          await subscribeToCount(clientId, queryKey, collection, {
            where,
            locale,
          })
        }

        if (type === 'find' || type === 'findByID') {
          // Register incremental subscription for find/findByID queries
          console.log('🔍 [ENDPOINT] Registering session-based subscription:', {
            clientId,
            queryKey,
            collection,
            where,
            sort,
            limit,
            userId,
          })

          await subscribeToQuery(clientId, queryKey, collection, {
            where,
            sort,
            limit,
            populate,
          })
        }

        // Execute the query or mutation
        let result
        switch (type) {
          case 'find':
            result = await req.payload.find({
              collection,
              where,
              sort,
              limit,
              page,
              depth,
              populate,
              locale,
              fallbackLocale,
              req,
            } as any)
            break

          case 'findByID':
            result = await req.payload.findByID({
              collection,
              id,
              depth,
              populate,
              locale,
              fallbackLocale,
              req,
            } as any)
            break

          case 'count':
            result = await req.payload.count({
              collection,
              where,
              locale,
              req,
            } as any)
            break

          case 'create':
            result = await req.payload.create({
              collection,
              data,
              depth,
              locale,
              fallbackLocale,
              req,
            } as any)
            break

          case 'update':
            result = await req.payload.update({
              collection,
              id,
              data,
              depth,
              locale,
              fallbackLocale,
              req,
            } as any)
            break

          case 'delete':
            result = await req.payload.delete({
              collection,
              id,
              req,
            } as any)
            break

          default:
            return Response.json({ error: 'Invalid operation type' }, { status: 400 })
        }

        return Response.json({
          data: result,
          queryKey,
          timestamp: Date.now(),
        })
      } catch (error) {
        console.error('Error in payload-sync endpoint:', error)
        return Response.json({ error: 'Internal server error' }, { status: 500 })
      }
    },
    method: 'post',
    path: '/query',
  }

  const payloadSSEEndpoint: Endpoint = {
    handler: async (req) => {
      try {
        const stream = new TransformStream()
        const encoder = new TextEncoder()
        const writer = stream.writable.getWriter()
        const subscriptions = getSubscriptions()
        const response = new Response(stream.readable, {
          headers: {
            // 'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'Content-Type': 'text/event-stream',
            'Content-Encoding': 'identity',
          },
        })
        if (!req.url) {
          throw new Error('Missing required parameters')
        }
        const url = new URL(req.url)
        const clientId = url.searchParams.get('clientId')
        if (!clientId) {
          throw new Error('Missing required parameters')
        }

        // Store client connection
        const client = { clientId, response, writer }
        writer.write(encoder.encode(`data: "connected"\n\n`))
        clients.set(clientId, client)

        // Clean up when client disconnects
        req.signal?.addEventListener('abort', async () => {
          console.log('ABORTING SIGNAL!')
          const client = clients.get(clientId)
          if (client) {
            console.log('DELETING CLIENT AND SUBSCRIPTIONS!')
            await subscriptions.deleteSession(clientId)
            clients.delete(clientId)
            client.writer.close().catch(console.error)
          }
        })

        console.log('SENDING RESPONSE!')
        return response
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        console.error(error, 'payloadSSEEndpoint - error')
        return new Response(JSON.stringify({ error: error.message }), {
          headers: { 'Content-Type': 'application/json' },
          status: 500,
        })
      }
    },
    method: 'get',
    path: '/sync',
  }

  return {
    payloadQueryEndpoint,
    payloadSSEEndpoint,
  }
}
