// storage-adapter-import-placeholder
import { postgresAdapter } from '@payloadcms/db-postgres'
import { payloadCloudPlugin } from '@payloadcms/payload-cloud'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

// Workspaces
import { Workspaces } from './collections/workspaces/Workspaces'
import { WorkspaceMemberships } from './collections/workspaces/WorkspaceMemberships'
import { Users } from './collections/workspaces/users/Users'
import { Media } from './collections/Media'

// Projects
import { Projects } from './collections/projects/Projects'
import { Tasks } from './collections/projects/Tasks'

// Plugins
import { payloadSync } from './plugins/payload-sync/src'

// Seed
import { seed } from './seed'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  maxDepth: 3,
  defaultDepth: 1,
  collections: [
    // Workspaces
    Users,
    Workspaces,
    WorkspaceMemberships,
    Media,

    // Projects
    Projects,
    Tasks,
  ],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    idType: 'uuid',
    pool: {
      connectionString: process.env.DATABASE_URI || '',
    },
  }),
  sharp,
  plugins: [
    payloadCloudPlugin(),
    // Real-time plugin
    payloadSync(),
    // storage-adapter-placeholder
  ],
  async onInit(payload) {
    await seed(payload)
  },
})
