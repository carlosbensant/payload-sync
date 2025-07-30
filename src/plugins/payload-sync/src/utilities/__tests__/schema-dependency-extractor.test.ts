import { extractQueryDependencies } from '../schema-dependency-extractor'
import type { SanitizedConfig } from 'payload'
import type { FindQuery, PayloadQuery } from '../../types'

// Mock PayloadCMS config that matches our actual schema
const mockPayloadConfig: Partial<SanitizedConfig> = {
  collections: [
    {
      slug: 'tasks',
      fields: [
        {
          name: 'name',
          type: 'text',
        },
        {
          name: 'assignee',
          type: 'relationship',
          relationTo: 'users',
        },
        {
          name: 'project',
          type: 'relationship',
          relationTo: 'projects',
        },
        {
          name: 'author',
          type: 'relationship',
          relationTo: 'users',
        },
      ],
    },
    {
      slug: 'users',
      fields: [
        {
          name: 'name',
          type: 'text',
        },
        {
          name: 'email',
          type: 'email',
        },
      ],
    },
    {
      slug: 'projects',
      fields: [
        {
          name: 'name',
          type: 'text',
        },
        {
          name: 'owner',
          type: 'relationship',
          relationTo: 'users',
        },
      ],
    },
  ],
} as SanitizedConfig

describe('Schema Dependency Extractor', () => {
  test('should extract dependencies from simple populate', () => {
    const query: FindQuery = {
      type: 'find',
      collection: 'tasks',
      populate: {
        assignee: true,
        project: true,
      },
    }

    const dependencies = extractQueryDependencies(query, mockPayloadConfig)

    expect(dependencies).toContain('tasks') // Always includes self
    expect(dependencies).toContain('users') // From assignee
    expect(dependencies).toContain('projects') // From project
    expect(dependencies.size).toBe(3)
  })

  test('should extract dependencies from nested populate', () => {
    const query: FindQuery = {
      type: 'find',
      collection: 'tasks',
      populate: {
        project: {
          populate: {
            owner: true,
          },
        },
      },
    }

    const dependencies = extractQueryDependencies(query, mockPayloadConfig)

    expect(dependencies).toContain('tasks') // Always includes self
    expect(dependencies).toContain('projects') // From project
    expect(dependencies).toContain('users') // From project.owner
    expect(dependencies.size).toBe(3)
  })

  test('should extract dependencies from where clauses', () => {
    const query: FindQuery = {
      type: 'find',
      collection: 'tasks',
      where: {
        'assignee.name': {
          equals: 'John Doe',
        },
      },
    }

    const dependencies = extractQueryDependencies(query, mockPayloadConfig)

    expect(dependencies).toContain('tasks') // Always includes self
    expect(dependencies).toContain('users') // From assignee relationship in where clause
    expect(dependencies.size).toBe(2)
  })

  test('should handle complex where clauses with logical operators', () => {
    const query: FindQuery = {
      type: 'find',
      collection: 'tasks',
      where: {
        and: [
          {
            'assignee.name': {
              equals: 'John',
            },
          },
          {
            'project.name': {
              contains: 'Test',
            },
          },
        ],
      },
    }

    const dependencies = extractQueryDependencies(query, mockPayloadConfig)

    expect(dependencies).toContain('tasks') // Always includes self
    expect(dependencies).toContain('users') // From assignee
    expect(dependencies).toContain('projects') // From project
    expect(dependencies.size).toBe(3)
  })

  test('should handle queries with both populate and where clauses', () => {
    const query: FindQuery = {
      type: 'find',
      collection: 'tasks',
      populate: {
        author: true,
      },
      where: {
        'assignee.email': {
          contains: '@example.com',
        },
      },
    }

    const dependencies = extractQueryDependencies(query, mockPayloadConfig)

    expect(dependencies).toContain('tasks') // Always includes self
    expect(dependencies).toContain('users') // From both author (populate) and assignee (where)
    expect(dependencies.size).toBe(2)
  })

  test('should handle count queries with where clauses', () => {
    const query: PayloadQuery = {
      type: 'count',
      collection: 'tasks',
      where: {
        'project.name': {
          equals: 'Important Project',
        },
      },
    }

    const dependencies = extractQueryDependencies(query, mockPayloadConfig)

    expect(dependencies).toContain('tasks') // Always includes self
    expect(dependencies).toContain('projects') // From project relationship in where clause
    expect(dependencies.size).toBe(2)
  })

  test('should handle findByID queries with populate', () => {
    const query: PayloadQuery = {
      type: 'findByID',
      collection: 'tasks',
      id: '123',
      populate: {
        assignee: true,
        project: {
          populate: {
            owner: true,
          },
        },
      },
    }

    const dependencies = extractQueryDependencies(query, mockPayloadConfig)

    expect(dependencies).toContain('tasks') // Always includes self
    expect(dependencies).toContain('users') // From assignee and project.owner
    expect(dependencies).toContain('projects') // From project
    expect(dependencies.size).toBe(3)
  })

  test('should handle queries with no dependencies', () => {
    const query: FindQuery = {
      type: 'find',
      collection: 'tasks',
      where: {
        name: {
          contains: 'test',
        },
      },
    }

    const dependencies = extractQueryDependencies(query, mockPayloadConfig)

    expect(dependencies).toContain('tasks') // Always includes self
    expect(dependencies.size).toBe(1) // Only self
  })

  test('should handle unknown collection gracefully', () => {
    const query: FindQuery = {
      type: 'find',
      collection: 'unknown-collection',
      populate: {
        someField: true,
      },
    }

    const dependencies = extractQueryDependencies(query, mockPayloadConfig)

    expect(dependencies).toContain('unknown-collection') // Always includes self
    expect(dependencies.size).toBe(1) // Only self, since schema is unknown
  })
})

// Example of how the system should work in practice
describe('Dependency Extraction Integration Example', () => {
  test('should correctly identify cross-collection dependencies for tasks query', () => {
    // Scenario: A tasks query that populates assignee and project
    const tasksQuery: FindQuery = {
      type: 'find',
      collection: 'tasks',
      populate: {
        assignee: true,
        project: {
          populate: {
            owner: true,
          },
        },
      },
      where: {
        status: 'in-progress',
      },
    }

    const dependencies = extractQueryDependencies(tasksQuery, mockPayloadConfig)

    // This query should be affected by changes to:
    // - tasks (direct collection)
    // - users (assignee and project.owner)
    // - projects (project relationship)

    expect(Array.from(dependencies).sort()).toEqual(['projects', 'tasks', 'users'])

    // In practice, this means:
    // - When a user changes, this query might need updates (assignee or project owner changed)
    // - When a project changes, this query might need updates (project data changed)
    // - When a task changes, this query definitely needs updates (direct collection)
  })
})
