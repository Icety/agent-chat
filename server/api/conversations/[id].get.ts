import { publicConversation } from '../../../lib/serialize'

// One conversation, archived or not: a chat opened by its link (from a feature screen, a push
// notification) must load even when the list leaves it out.
export default defineOwnerHandler(async event => {
  const id = getRouterParam(event, 'id') ?? ''
  const conversation = await useAgentChat().store.conversations.get(id)
  if (!conversation) throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })
  return publicConversation(conversation)
})
