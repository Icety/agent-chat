import { z } from 'zod'

const schema = z.object({
  text: z.string().min(1).max(20_000),
  agent: z.string().optional(),
  conversationId: z.string().optional(),
})

export default defineInternalHandler(async event => {
  const input = await readValidatedBody(event, schema.parse)
  const message = await useAgentChat().chat.notify({ text: input.text, agentName: input.agent, conversationId: input.conversationId })
  return { ok: true, conversationId: message.conversationId }
})
