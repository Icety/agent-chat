import { z } from 'zod'

export default defineOwnerHandler(async event => {
  const { endpoint } = await readValidatedBody(event, z.object({ endpoint: z.string().url() }).parse)
  await useAgentChat().store.push.delete(endpoint)
  return { ok: true }
})
