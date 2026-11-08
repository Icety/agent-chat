import { z } from 'zod'

export default defineInternalHandler(async event => {
  const { ids } = await readValidatedBody(event, z.object({ ids: z.array(z.string()).max(500) }).parse)
  await useAgentChat().chat.ack(ids)
  return { ok: true }
})
