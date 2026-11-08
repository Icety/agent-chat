import type { AgentSummary, ChatMessage, ConversationSummary, WireEvent } from '../../shared/types'
import { messagePreview } from '../../shared/preview'
import { observeActivity, type ActivityBuffer } from '../utils/activity'
import { openLiveStream } from '../utils/live'
import { liveTopics } from '../utils/topics'

// One live stream for the whole app, however many components call useChat().
let stream: ReturnType<typeof openLiveStream> | undefined
let openedBefore = false

// One shared store for the whole app: agents, conversations, loaded messages, and a
// live event stream that keeps them up to date. State keys are prefixed so a host's own
// useState('agents') never collides.
export const useChat = () => {
  const agents = useState<AgentSummary[]>('agent-chat:agents', () => [])
  const conversations = useState<ConversationSummary[]>('agent-chat:conversations', () => [])
  const messages = useState<Record<string, ChatMessage[]>>('agent-chat:messages', () => ({}))
  const connected = useState<boolean>('agent-chat:connected', () => false)
  // What this device saw each conversation's agent do (activity receipts), see utils/activity.ts.
  const activityRuns = useState<ActivityBuffer>('agent-chat:activity-runs', () => ({}))

  const observe = (c: ConversationSummary) => {
    const next = observeActivity(activityRuns.value, c.id, c.activity, new Date().toISOString())
    if (next !== activityRuns.value) activityRuns.value = next
  }

  const upsertConversation = (incoming: ConversationSummary) => {
    observe(incoming)
    const old = conversations.value.find(x => x.id === incoming.id)
    // Live events carry no preview: keep the one we have.
    const c = incoming.preview === undefined && old ? { ...incoming, preview: old.preview } : incoming
    const rest = conversations.value.filter(x => x.id !== c.id)
    conversations.value = (c.archived ? rest : [c, ...rest])
      .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))
  }

  const upsertMessage = (m: ChatMessage) => {
    if (m.origin !== 'system') {
      const c = conversations.value.find(x => x.id === m.conversationId)
      const preview = messagePreview(m)
      if (c && c.preview !== preview) conversations.value = conversations.value.map(x => (x.id === c.id ? { ...x, preview } : x))
    }
    const list = messages.value[m.conversationId]
    if (!list) return
    const index = list.findIndex(x => x.id === m.id)
    // A late HTTP response must not turn a delivered message back into pending.
    const merged = (old: ChatMessage): ChatMessage =>
      old.status === 'delivered' && m.status === 'pending' ? { ...m, status: 'delivered' } : m
    messages.value[m.conversationId] = index >= 0
      ? list.map(x => (x.id === m.id ? merged(x) : x))
      : [...list, m]
  }

  const apply = (event: WireEvent) => {
    switch (event.type) {
      case 'message':
        upsertMessage(event.message)
        return
      case 'delivered': {
        const list = messages.value[event.conversationId]
        if (list) {
          messages.value[event.conversationId] = list.map(m => (event.messageIds.includes(m.id) ? { ...m, status: 'delivered' } : m))
        }
        return
      }
      case 'activity': {
        const c = conversations.value.find(x => x.id === event.conversationId)
        // The server counts activity as being active (lastActivityAt), see shared/working.ts.
        if (c) upsertConversation({ ...c, activity: event.activity, lastActivityAt: event.activity ? new Date().toISOString() : c.lastActivityAt })
        return
      }
      case 'conversation':
        upsertConversation(event.conversation)
        return
      case 'topic':
        liveTopics.dispatch(event.topic, event.data)
    }
  }

  const loadLists = async () => {
    const [a, c] = await Promise.all([
      $fetch<AgentSummary[]>('/api/agents'),
      $fetch<ConversationSummary[]>('/api/conversations'),
    ])
    agents.value = a
    conversations.value = c
    for (const conversation of c) observe(conversation)
  }

  const loadMessages = async (conversationId: string) => {
    messages.value[conversationId] = await $fetch<ChatMessage[]>(`/api/conversations/${conversationId}/messages`)
  }

  const connect = () => {
    if (stream || import.meta.server) return
    stream = openLiveStream({
      open: () => new EventSource('/api/events'),
      onOpen: () => {
        connected.value = true
        // Catch up on whatever happened while the stream was down.
        void loadLists()
        for (const id of Object.keys(messages.value)) void loadMessages(id)
        if (openedBefore) liveTopics.reconnected()
        openedBefore = true
      },
      onDown: () => { connected.value = false },
      onMessage: data => apply(JSON.parse(data) as WireEvent),
    })
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') stream?.restart()
    })
  }

  const send = async (conversationId: string, input: { text: string, files?: File[], voice?: Blob }) => {
    const form = new FormData()
    form.append('text', input.text)
    for (const file of input.files ?? []) form.append('files', file, file.name)
    if (input.voice) {
      const ext = input.voice.type.includes('mp4') ? 'm4a' : 'webm'
      form.append('voice', input.voice, `voice.${ext}`)
    }
    const message = await $fetch<ChatMessage>(`/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: form,
      // Never leave the send button spinning on a dead connection. A voice note is transcribed first.
      timeout: input.voice ? 180_000 : 30_000,
    })
    upsertMessage(message)
    return message
  }

  // A message that did not reach the agent goes back to its inbox (the same message, no copy).
  const retry = async (conversationId: string, messageId: string) => {
    const message = await $fetch<ChatMessage>(`/api/conversations/${conversationId}/messages/${messageId}/retry`, { method: 'POST', timeout: 30_000 })
    upsertMessage(message)
    return message
  }

  const newConversation = async (agentId: string) => {
    const c = await $fetch<ConversationSummary>('/api/conversations', { method: 'POST', body: { agentId } })
    upsertConversation(c)
    return c
  }

  const updateConversation = async (id: string, patch: { title?: string, archived?: boolean }) => {
    const c = await $fetch<ConversationSummary | null>(`/api/conversations/${id}`, { method: 'PATCH', body: patch })
    if (c) upsertConversation(c)
    if (patch.archived) conversations.value = conversations.value.filter(x => x.id !== id)
  }

  const agentName = (agentId: string) => agents.value.find(a => a.id === agentId)?.name ?? 'Assistant'

  return {
    agents, conversations, messages, connected, activityRuns,
    loadLists, loadMessages, connect, send, retry, newConversation, updateConversation, agentName,
  }
}
