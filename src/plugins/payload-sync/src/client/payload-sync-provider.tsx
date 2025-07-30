'use client'

import { useLayoutEffect, useState } from 'react'
import { createPayloadClient } from './payload-sync'

interface PayloadQueryProviderProps {
  children: React.ReactNode
}

/**
 * Provider that initializes the Payload Query client with the provided configuration.
 * Configuration should be passed from the server-side payload config.
 * Automatically integrates with PayloadCMS user authentication.
 */
export function PayloadQueryProvider({ children }: PayloadQueryProviderProps) {
  // const { user } = useAuth()
  const [isConnecting, setConnecting] = useState(true)

  const handleOnConnect = () => {
    setConnecting(false)
  }

  useLayoutEffect(() => {
    // Initialize the client with the provided config and user context
    const userId = null
    const client = createPayloadClient(userId, {
      onConnect: handleOnConnect,
    })
    client.connect()
  }, []) // Re-initialize when user changes

  if (isConnecting) {
    return null
  }

  // No context needed - the view store manages everything
  return <>{children}</>
}
