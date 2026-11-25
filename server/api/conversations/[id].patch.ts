import { z } from 'zod'
import { publicConversation } from '../../../lib/serialize'
import { isMainChat } from '../../../shared/working'

const schema = z.object({
  title: z.string().trim().min(1).max(80).optional(),
  archived: z.boolean().optional(),
})

export default defineOwnerHandler(async event => {
  const id = getRouterParam(event, 'id') ?? ''
  const patch = await readValidatedBody(event, schema.parse)
  const { store, bus, sessions } = useAgentChat()
  const current = await store.conversations.get(id)
  if (!current) throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })
  // Scripts and system notes land in Main: it stays, under its name.
  if (isMainChat(current) && (patch.archived || (patch.title && patch.title !== current.title))) {
    throw createError({ statusCode: 409, statusMessage: 'The main chat cannot be archived or renamed' })
  }
  if (patch.title) await store.conversations.rename(id, patch.title)
  if (patch.archived !== undefined) {
    await store.conversations.setArchived(id, patch.archived)
    if (patch.archived) await sessions.stop(id)
  }
  const conversation = await store.conversations.get(id)
  if (conversation) bus.publish({ type: 'conversation', conversation })
  return conversation ? publicConversation(conversation) : null
})
