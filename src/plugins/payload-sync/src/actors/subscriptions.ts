import { actor } from '@rivetkit/actor'

// Session-based subscription tracking
export interface SessionSubscription {
  clientId: string
  queries: Query[]
  lastActivity: Date
}

export type Query = {
  queryKey: string
  collection: string
  queryType: 'find' | 'findByID' | 'count'
  params: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    where?: any
    sort?: string
    limit?: number
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    populate?: any
  }
  lastSyncTime: Date
}

interface Dependency {
  [queryKey: string]: {
    collection: string
    dependencies: string[] // Collections this query depends on
    query: 'find' | 'findByID' | 'count'
  }
}

interface ReverseDependency {
  [collection: string]: string[] // Query keys that depend on this collection
}

export const subscriptions = actor({
  // Persistent state that survives restarts: https://rivet.gg/docs/actors/state
  state: {
    sessions: [] as Array<{ clientId: string; session: SessionSubscription }>,
    // Track query dependencies
    dependencies: {} as Dependency,
    reverseDependencies: {} as ReverseDependency,
  },

  actions: {
    // Sessions
    getSessions: (c) => c.state.sessions,

    getSession: (c, clientId) => c.state.sessions.find((s) => s.clientId === clientId)?.session,

    addSession: (c, clientId, session: SessionSubscription) => {
      const index = c.state.sessions.findIndex((s) => s.clientId === clientId)
      if (index !== -1) {
        c.state.sessions[index].session = session
      } else {
        c.state.sessions.push({ clientId, session })
      }
      return session
    },

    deleteSession: (c, clientId) => {
      c.state.sessions = c.state.sessions.filter((s) => s.clientId !== clientId)
    },

    cleanupOldSessions: (c, maxAgeMinutes: number = 60) => {
      const cutoffTime = new Date(Date.now() - maxAgeMinutes * 60 * 1000)
      c.state.sessions = c.state.sessions.filter(
        ({ session }) => session.lastActivity >= cutoffTime,
      )
    },

    // Queries
    getQueries: (c, clientId) => {
      return c.state.sessions.find((s) => s.clientId === clientId)?.session.queries
    },

    addQueryToSession: (c, clientId, query: Query) => {
      const sessionEntry = c.state.sessions.find((s) => s.clientId === clientId)
      if (sessionEntry) {
        const queries = sessionEntry.session.queries
        const existingIndex = queries.findIndex((q) => q.queryKey === query.queryKey)
        if (existingIndex !== -1) {
          queries[existingIndex] = query
        } else {
          queries.push(query)
        }
        sessionEntry.session.lastActivity = new Date()
      }
    },

    // Dependencies
    getDependencies: (c) => c.state.dependencies,

    addDependencies: (
      c,
      queryKey,
      dependencyObject: {
        collection: string
        dependencies: string[]
        query: 'find' | 'findByID' | 'count'
      },
    ) => {
      c.state.dependencies[queryKey] = dependencyObject
    },

    getReverseDependencies: (c) => c.state.reverseDependencies,

    addReverseDependencies: (c, queryKey, dependencies: string[]) => {
      dependencies.forEach((depCollection) => {
        if (!c.state.reverseDependencies[depCollection]) {
          c.state.reverseDependencies[depCollection] = []
        }
        if (!c.state.reverseDependencies[depCollection].includes(queryKey)) {
          c.state.reverseDependencies[depCollection].push(queryKey)
        }
      })
    },

    removeDependencies: (c, queryKey) => {
      const queryDeps = c.state.dependencies[queryKey]
      if (!queryDeps) return

      queryDeps.dependencies.forEach((depCollection) => {
        const arr = c.state.reverseDependencies[depCollection]
        if (arr) {
          c.state.reverseDependencies[depCollection] = arr.filter((qk) => qk !== queryKey)
          if (c.state.reverseDependencies[depCollection].length === 0) {
            delete c.state.reverseDependencies[depCollection]
          }
        }
      })

      delete c.state.dependencies[queryKey]
    },
  },
})
