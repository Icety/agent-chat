import { z } from 'zod'

const schema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
})

export default defineOwnerHandler(async event => {
  const sub = await readValidatedBody(event, schema.parse)
  await useAgentChat().store.push.save({ endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: getHeader(event, 'user-agent') ?? null })
  return { ok: true }
})
