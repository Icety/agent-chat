import type { AgentSummary, ConversationSummary } from '../../shared/types'
import { isWorking } from '../../shared/working'

// What a composer hands over to be sent (ChatComposer).
export interface ComposerInput {
  text: string
  files: File[]
  voice?: Blob
}

// How an agent shows up in lists and headers. `kind` and `tone` are for ChatAgentAvatar: the
// package knows 'chat'; a host's own avatar (a component override) may know more ('koopa', ...).
export interface AgentLook {
  kind: string
  icon?: string
  tone?: string
  label: string
  hint: string
  // Order in the chat list and "New chat" menus: lower first. Default: by creation.
  rank?: number
  // Folded away under "Other assistants" (test agents).
  folded?: boolean
}

// What a host or layer knows about one agent (registerAgentLook). Undefined: not mine.
export type AgentLookProvider = (agent: AgentSummary, ctx: { agents: AgentSummary[] }) => AgentLook | undefined

export const defaultLook = (agent: AgentSummary | undefined): AgentLook => agent
  ? { kind: 'chat', label: agent.name, hint: agent.alwaysOn ? 'Always on' : 'Assistant' }
  : { kind: 'chat', label: 'Assistant', hint: '' }

// The first look a provider gives, else the default.
export const agentLook = (agent: AgentSummary | undefined, agents: AgentSummary[], providers: AgentLookProvider[]): AgentLook => {
  if (!agent) return defaultLook(undefined)
  for (const provider of providers) {
    const look = provider(agent, { agents })
    if (look) return look
  }
  return defaultLook(agent)
}

// An agent's main chat is its oldest conversation, like the server's mainConversationFor.
export const mainConversation = (conversations: ConversationSummary[], agentId: string): ConversationSummary | undefined =>
  conversations
    .filter(c => c.agentId === agentId)
    .reduce<ConversationSummary | undefined>((oldest, c) => (!oldest || c.createdAt < oldest.createdAt ? c : oldest), undefined)

export interface ChatGroup {
  id: string
  label: string
  running: boolean
  conversations: ConversationSummary[]
}

// Agents in list order, split into the main ones and the folded ones.
export const orderAgents = (agents: AgentSummary[], lookOf: (agentId: string) => AgentLook): { main: { agent: AgentSummary, label: string }[], more: { agent: AgentSummary, label: string }[] } => {
  const ranked = agents
    .map((agent, index) => ({ agent, look: lookOf(agent.id), index }))
    .sort((a, b) => (a.look.rank ?? Number.MAX_SAFE_INTEGER) - (b.look.rank ?? Number.MAX_SAFE_INTEGER) || a.index - b.index)
    .map(({ agent, look }) => ({ agent, label: look.label, folded: look.folded }))
  const main = ranked.filter(g => !g.folded).map(({ agent, label }) => ({ agent, label }))
  const more = ranked.filter(g => g.folded).map(({ agent, label }) => ({ agent, label }))
  return main.length ? { main, more } : { main: more, more: [] }
}

export const RECENT_DAYS = 7

// The chat list: what is working now first (isWorking), then each main agent's recent chats in
// the given order, then older chats of those as "Earlier". Chats of the `more` agents (test
// agents, a host's "other" group) fold away under `other`. Empty groups are left out.
export const groupChats = (
  conversations: ConversationSummary[],
  order: { main: { agent: AgentSummary, label: string }[], more: { agent: AgentSummary }[] },
  now: Date,
): { groups: ChatGroup[], other: ConversationSummary[] } => {
  const since = now.getTime() - RECENT_DAYS * 86_400_000
  const mainIds = new Set(order.main.map(g => g.agent.id))
  const moreIds = new Set(order.more.map(g => g.agent.id))
  const running = conversations.filter(c => isWorking(c, now))
  const idle = conversations.filter(c => !isWorking(c, now))
  const recent = (c: ConversationSummary) => Date.parse(c.lastActivityAt) >= since

  const groups: ChatGroup[] = [
    { id: 'running', label: 'Running', running: true, conversations: running },
    ...order.main.map(g => ({
      id: g.agent.id,
      label: g.label,
      running: false,
      conversations: idle.filter(c => c.agentId === g.agent.id && recent(c)),
    })),
    { id: 'earlier', label: 'Earlier', running: false, conversations: idle.filter(c => mainIds.has(c.agentId) && !recent(c)) },
  ]
  return {
    groups: groups.filter(g => g.conversations.length > 0),
    other: idle.filter(c => moreIds.has(c.agentId)),
  }
}
