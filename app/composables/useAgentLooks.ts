import { shallowReactive } from 'vue'
import { agentLook, mainConversation, orderAgents, type AgentLook, type AgentLookProvider } from '../utils/chats'
import type { ConversationSummary } from '../../shared/types'

const providers = shallowReactive(new Map<string, AgentLookProvider>())

// Register from a client plugin: registerAgentLook('projects', agent => ...). Providers run in
// registration order; the first that returns a look wins. Returns a function that removes it.
export const registerAgentLook = (key: string, provider: AgentLookProvider): (() => void) => {
  providers.set(key, provider)
  return () => {
    if (providers.get(key) === provider) providers.delete(key)
  }
}

// Who is who: how each agent looks, the list order, and starting or reopening chats. Shared by
// the chat list, the thread header and a host's own screens.
export const useAgents = () => {
  const { agents, conversations, newConversation } = useChat()
  const config = useAppConfig().agentChat
  const toast = useToast()

  const lookOf = (agentId: string | undefined): AgentLook =>
    agentLook(agents.value.find(a => a.id === agentId), agents.value, [...providers.values()])
  const ordered = computed(() => {
    const { main, more } = orderAgents(agents.value, lookOf)
    return [...main, ...more].map(g => g.agent)
  })
  const order = computed(() => orderAgents(agents.value, lookOf))
  const latestOf = (agentId: string): ConversationSummary | undefined => conversations.value.find(c => c.agentId === agentId)
  const mainOf = (agentId: string): ConversationSummary | undefined => mainConversation(conversations.value, agentId)

  const startChat = async (agentId: string | undefined): Promise<ConversationSummary | undefined> => {
    if (!agentId) return undefined
    try {
      const c = await newConversation(agentId)
      await navigateTo(`${config.conversationPath}${c.id}`)
      return c
    }
    catch (err) {
      toast.add({ title: 'Could not start a chat', description: String(err), color: 'error' })
      return undefined
    }
  }

  // The agent's latest chat, or a new one when it has none.
  const openAgent = async (agentId: string | undefined) => {
    if (!agentId) return
    const latest = latestOf(agentId)
    if (latest) return navigateTo(`${config.conversationPath}${latest.id}`)
    return startChat(agentId)
  }

  // For a "New chat" menu (UDropdownMenu items).
  const newChatItems = computed(() => [ordered.value.map(agent => ({
    label: `New chat with ${lookOf(agent.id).label}`,
    icon: lookOf(agent.id).icon ?? 'i-lucide-message-circle',
    onSelect: () => { void startChat(agent.id) },
  }))])

  return { ordered, order, lookOf, latestOf, mainOf, startChat, openAgent, newChatItems }
}
