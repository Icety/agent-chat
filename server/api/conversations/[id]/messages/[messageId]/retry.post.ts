import { publicMessage } from '../../../../../../lib/serialize'

// Retry a message of the owner's that did not reach the agent: the same message goes back to the inbox.
export default defineOwnerHandler(async event => {
  const id = getRouterParam(event, 'id') ?? ''
  const messageId = getRouterParam(event, 'messageId') ?? ''
  const { store, chat } = useAgentChat()
  const message = await store.messages.get(messageId)
  if (!message || message.conversationId !== id) throw createError({ statusCode: 404, statusMessage: 'Message not found' })
  if (message.role !== 'user') throw createError({ statusCode: 409, statusMessage: 'Only messages to the agent can be retried' })
  return publicMessage(await chat.retryMessage(id, messageId))
})
