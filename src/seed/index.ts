import type { Payload, TypedUser } from 'payload'
import { faker } from '@faker-js/faker'

// 🔧 Configuration - Customize these values
const SEED_CONFIG = {
  workspaces: ['reezer', 'bakery', 'iris'],
  usersPerWorkspace: 2,
  categories: [
    'Fashion',
    'Technology',
    'Food & Beverage',
    'Health & Fitness',
    'Travel',
    'Lifestyle',
  ],
}

export const seed = async (payload: Payload) => {
  const response = await payload.find({
    collection: 'users',
    limit: 1,
  })

  if (!response.docs.length) {
    console.log('🌱 Starting comprehensive seed with faker data...')

    let adminCreated = false
    // Create workspaces, users, channels, and messages
    for (const workspaceName of SEED_CONFIG.workspaces) {
      console.log(`\n🏢 Creating workspace: ${workspaceName}`)

      // Create users for this workspace
      const workspaceUsers: any[] = []
      for (let i = 0; i < SEED_CONFIG.usersPerWorkspace; i++) {
        let firstName = faker.person.firstName()
        let lastName = faker.person.lastName()
        let username = faker.internet.username({ firstName, lastName }).toLowerCase()
        let email = faker.internet.email({ firstName, lastName }).toLowerCase()

        if (!adminCreated) {
          console.log('🔑 Using info@ready.do for admin user')
          email = 'info@ready.do'
          firstName = 'Carlos'
          lastName = 'Bensant'
          username = 'carlosbensant'
          adminCreated = true
        }

        // Create different user types
        let userType: 'user' | 'creator' | 'admin' = 'user'
        if (i === 0) {
          userType = 'admin'
        } else if (i === 1 && SEED_CONFIG.usersPerWorkspace > 2) {
          userType = 'creator' // Make second user a creator if we have more than 2 users
        } else if (Math.random() > 0.5) {
          userType = 'creator' // 50% chance for other users to be creators
        }

        const user = await payload.create({
          collection: 'users',
          data: {
            username,
            name: `${firstName} ${lastName}`,
            first_name: firstName,
            last_name: lastName,
            email,
            password: 'test123',
            type: userType,
            position: faker.person.jobTitle(),
            description: {
              root: {
                type: 'root',
                children: [
                  {
                    type: 'paragraph',
                    version: 1,
                    children: [
                      {
                        type: 'text',
                        text: faker.person.bio(),
                      },
                    ],
                  },
                ],
                direction: 'ltr',
                format: '',
                indent: 0,
                version: 1,
              },
            },
          },
          disableVerificationEmail: true,
          disableTransaction: true,
        })
        workspaceUsers.push(user)

        console.log(`   👤 Created user: ${user.name} (${user.username})`)
      }

      const req = {
        user: workspaceUsers[0] as TypedUser,
      }

      // Create workspace (this will automatically create "general" channel)
      const workspace = await payload.create({
        req,
        collection: 'workspaces',
        data: {
          name: workspaceName.charAt(0).toUpperCase() + workspaceName.slice(1),
          slug: workspaceName,
        },
        disableTransaction: true,
      })

      // Create workspace memberships
      for (const user of workspaceUsers) {
        await payload.create({
          req,
          overrideAccess: false,
          collection: 'workspaceMemberships',
          data: {
            user: user.id,
            workspace: workspace.id,
            role: 'user',
          },
          disableTransaction: true,
        })
      }

      console.log(`   ✅ Created workspace: ${workspace.name}`)
    }

    console.log(`
🎉 Comprehensive seed completed successfully!

📊 Summary:
- ${SEED_CONFIG.workspaces.length} workspaces: ${SEED_CONFIG.workspaces.join(', ')}
- ${SEED_CONFIG.workspaces.length * SEED_CONFIG.usersPerWorkspace} users total (${SEED_CONFIG.usersPerWorkspace} per workspace)

🚀 Ready to explore and test Payload Sync!
    `)
  } else {
    console.log('Database already seeded, skipping...')
  }
}
