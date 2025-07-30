import type { CollectionConfig } from 'payload'

export const MediaFields: CollectionConfig['fields'] = [
  {
    name: 'alt',
    type: 'text',
    required: true,
  },
  {
    name: 'title',
    type: 'text',
  },
  {
    name: 'caption',
    type: 'richText',
  },
]

const Media: CollectionConfig = {
  slug: 'media',
  upload: {
    // staticDir: path.resolve(__dirname, '../../../media'),
    disableLocalStorage: true,

    imageSizes: [
      {
        name: 'thumbnail',
        width: 400,
        height: 300,
        position: 'centre',
      },
      {
        name: 'card',
        width: 768,
        height: 1024,
        position: 'centre',
      },
      {
        name: 'tablet',
        width: 1024,
        height: undefined,
        position: 'centre',
      },
    ],
  },
  access: {
    read: () => true,
  },
  fields: MediaFields,
  timestamps: true,
}

export { Media }
