import { z } from 'zod'
import { publicConversation } from '../../../lib/serialize'

const schema = z.object({
  agentId: z.string().min(1),
  title: z.string().trim().min(1).max(80).optional(),
})

export default defineOwnerHandler(async event => {
  const { agentId, title } = await readValidatedBody(event, schema.parse)
  const { store, bus, config } = useAgentChat()
  if (!(await store.agents.get(agentId))) throw createError({ statusCode: 404, statusMessage: 'Agent not found' })
  const stamp = new Date().toLocaleString('en-GB', { timeZone: config.timeZone ?? 'UTC', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  const conversation = await store.conversations.create({ agentId, title: title ?? `New chat ${stamp}` })
  bus.publish({ type: 'conversation', conversation })
  return publicConversation(conversation)
})
