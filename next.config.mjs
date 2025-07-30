import { withPayload } from '@payloadcms/next/withPayload'

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    reactCompiler: false,
  },
  env: {
    // Ensure Sockudo environment variables are available on the client
    NEXT_PUBLIC_SOCKUDO_APP_KEY: process.env.NEXT_PUBLIC_SOCKUDO_APP_KEY,
    NEXT_PUBLIC_SOCKUDO_APP_CLUSTER: process.env.NEXT_PUBLIC_SOCKUDO_APP_CLUSTER,
    NEXT_PUBLIC_SOCKUDO_APP_HOST: process.env.NEXT_PUBLIC_SOCKUDO_APP_HOST,
    NEXT_PUBLIC_SOCKUDO_APP_PORT: process.env.NEXT_PUBLIC_SOCKUDO_APP_PORT,
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
