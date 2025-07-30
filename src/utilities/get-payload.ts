import payload from 'payload'

export const getPayload = async () => {
  if (!payload.initialized) {
    await payload.init({
      secret: process.env.PAYLOAD_SECRET || '',
      local: true,
    })
  }
  return payload
}
