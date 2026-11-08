import { z } from 'zod'
import { publicConversation } from '../../../lib/serialize'

const schema = z.object({
  title: z.string().trim().min(1).max(80).optional(),
  archived: z.boolean().optional(),
})

export default defineOwnerHandler(async event => {
  const id = getRouterParam(event, 'id') ?? ''
  const patch = await readValidatedBody(event, schema.parse)
  const { store, bus, sessions } = useAgentChat()
  if (!(await store.conversations.get(id))) throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })
  if (patch.title) await store.conversations.rename(id, patch.title)
  if (patch.archived !== undefined) {
    await store.conversations.setArchived(id, patch.archived)
    if (patch.archived) await sessions.stop(id)
  }
  const conversation = await store.conversations.get(id)
  if (conversation) bus.publish({ type: 'conversation', conversation })
  return conversation ? publicConversation(conversation) : null
})
