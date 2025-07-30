import { type Config } from 'payload'

import { createEndpoints, initializeActor } from './utilities/endpoints'
import { beforeChange, afterOperation } from './hooks/afterOperation'
import { initializeDependencyTracker } from './utilities/dependency-tracker'

export const payloadSync = (/*pluginConfig: PluginConfig*/) =>
  async (config: Config): Promise<Config> => {
    // Initialize the global Actor instance
    initializeActor()

    // Create endpoints (which will use the already initialized instance)
    const { payloadQueryEndpoint, payloadSSEEndpoint } = createEndpoints()

    return {
      ...config,
      collections: config.collections?.map((collection) => {
        return {
          ...collection,
          hooks: {
            ...collection.hooks,
            beforeChange: [...(collection.hooks?.beforeChange || []), beforeChange],
            afterOperation: [...(collection.hooks?.afterOperation || []), afterOperation],
          },
        }
      }),
      endpoints: [...(config.endpoints || []), payloadQueryEndpoint, payloadSSEEndpoint],
      onInit: async (payload) => {
        // Initialize dependency tracker with schema
        initializeDependencyTracker(payload.config)

        // Call original onInit if it exists
        if (config.onInit) {
          await config.onInit(payload)
        }
      },
    }
  }
