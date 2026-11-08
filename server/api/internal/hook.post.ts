import { z } from 'zod'

const schema = z.object({
  conversationId: z.string().min(1),
  event: z.object({
    hook_event_name: z.string(),
    session_id: z.string().optional(),
    tool_name: z.string().optional(),
    tool_input: z.record(z.string(), z.unknown()).optional(),
  }).passthrough(),
})

export default defineInternalHandler(async event => {
  const { conversationId, event: hookEvent } = await readValidatedBody(event, schema.parse)
  await useAgentChat().chat.hook(conversationId, hookEvent)
  return { ok: true }
})
