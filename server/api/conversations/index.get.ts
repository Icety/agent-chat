import { publicConversation } from '../../../lib/serialize'
import { messagePreview } from '../../../shared/preview'

export default defineOwnerHandler(async event => {
  const includeArchived = getQuery(event).archived === '1'
  const { store } = useAgentChat()
  const last = await store.messages.last()
  return (await store.conversations.list({ includeArchived })).map(c => {
    const message = last.get(c.id)
    return { ...publicConversation(c), preview: message ? messagePreview(message) : null }
  })
})
