import type { ChatStore } from './ports'
import { isWorking } from '../shared/working'
import { UNDELIVERED_AFTER_MS } from '../shared/delivery'
import type { ChatAttention } from '../shared/types'

export const MAIN_TITLE = 'Main'

// What a home screen shows about chats: those whose messages did not get through, and running
// conversations that are working right now (isWorking). Hosts turn this into their own summary.
export const buildChatAttention = async (deps: { store: ChatStore, running: string[], now: Date }): Promise<ChatAttention> => {
  const { store } = deps
  const titleOf = async (conversationId: string): Promise<string | undefined> => {
    const conversation = await store.conversations.get(conversationId)
    if (!conversation) return undefined
    const agent = await store.agents.get(conversation.agentId)
    return conversation.title === MAIN_TITLE ? (agent?.name ?? conversation.title) : conversation.title
  }

  const stuck = new Map<string, number>()
  for (const m of await store.messages.undelivered(new Date(deps.now.getTime() - UNDELIVERED_AFTER_MS))) {
    stuck.set(m.conversationId, (stuck.get(m.conversationId) ?? 0) + 1)
  }
  const undelivered = await Promise.all([...stuck].map(async ([conversationId, count]) => ({
    conversationId, count, title: (await titleOf(conversationId)) ?? 'Chat',
  })))

  const atWork: ChatAttention['atWork'] = []
  for (const conversationId of deps.running) {
    const conversation = await store.conversations.get(conversationId)
    // A running session that is idle (an always-on assistant, mostly) is not at work.
    if (!conversation || conversation.archived || !isWorking(conversation, deps.now)) continue
    atWork.push({
      conversationId,
      agentId: conversation.agentId,
      title: (await titleOf(conversationId)) ?? conversation.title,
      activity: conversation.activity,
    })
  }
  return { undelivered, atWork }
}
