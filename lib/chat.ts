import type { Attachment, ChatStore, Conversation, Message, MessageOrigin } from './ports'
import type { Bus, ChatEvent } from './bus'
import type { Inbox } from './inbox'
import type { Sessions } from './sessions'
import type { PushPayload } from './push'
import { describeTool } from './activity'
import { MAIN_TITLE } from './attention'

export interface ChatDeps {
  store: ChatStore
  sessions: Sessions
  inbox: Inbox
  bus: Bus<ChatEvent>
  push: (payload: PushPayload) => Promise<void>
  idleHours: number
  // Where a push notification opens a conversation, e.g. id => `/c/${id}`.
  conversationUrl: (conversationId: string) => string
  // The chat's own channel; its reply tool is not shown as activity.
  channelServer?: string
  now?: () => Date
  // False while claude is not logged in: a session started then hangs on the login screen.
  canStart?: () => Promise<boolean>
}

export interface HookEvent {
  hook_event_name: string
  session_id?: string
  tool_name?: string
  tool_input?: Record<string, unknown>
}

const parseSettings = (raw: string | null, agentName: string): Record<string, unknown> | undefined => {
  if (!raw) return undefined
  try {
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined
  }
  catch {
    console.error(`[chat] settings of agent ${agentName} are not valid JSON; ignored`)
    return undefined
  }
}
const PUSH_BODY_MAX = 180

const excerpt = (text: string): string =>
  text.length > PUSH_BODY_MAX ? `${text.slice(0, PUSH_BODY_MAX)}…` : text

export const createChat = (deps: ChatDeps) => {
  const { store, sessions, inbox, bus } = deps
  const now = deps.now ?? (() => new Date())

  const requireConversation = async (id: string) => {
    const conversation = await store.conversations.get(id)
    if (!conversation) throw new Error(`conversation ${id} not found`)
    const agent = await store.agents.get(conversation.agentId)
    if (!agent) throw new Error(`agent ${conversation.agentId} of conversation ${id} not found`)
    return { conversation, agent }
  }

  const canStart = deps.canStart ?? (async () => true)

  const ensureSession = async (conversationId: string): Promise<void> => {
    const { conversation, agent } = await requireConversation(conversationId)
    if (!(await canStart())) return
    await sessions.start({
      conversationId,
      cwd: agent.cwd,
      resumeSessionId: conversation.claudeSessionId,
      extraArgs: agent.extraArgs?.split(/\s+/).filter(Boolean) ?? [],
      settings: parseSettings(agent.settings, agent.name),
    })
  }

  const startInBackground = (conversationId: string): void => {
    // Starting claude can take half a minute; the message waits in the inbox meanwhile.
    ensureSession(conversationId).catch(err => {
      console.error(`[chat] could not start session for ${conversationId}`, err)
    })
  }

  const publishConversation = async (conversationId: string): Promise<void> => {
    const conversation = await store.conversations.get(conversationId)
    if (conversation) bus.publish({ type: 'conversation', conversation })
  }

  const setActivity = async (conversationId: string, activity: string | null): Promise<void> => {
    await store.conversations.setActivity(conversationId, activity)
    bus.publish({ type: 'activity', conversationId, activity })
  }

  // A message for the agent: stored as pending, handed out by the inbox, and the session started.
  const toAgent = async (input: { conversationId: string, text: string, attachments?: Attachment[], transcript?: string | null, origin: MessageOrigin }): Promise<Message> => {
    await requireConversation(input.conversationId)
    const message = await store.messages.add({
      conversationId: input.conversationId,
      role: 'user',
      text: input.text,
      attachments: input.attachments,
      transcript: input.transcript,
      status: 'pending',
      origin: input.origin,
    }, now())
    await store.conversations.touch(input.conversationId, now())
    bus.publish({ type: 'message', conversationId: input.conversationId, message })
    await publishConversation(input.conversationId)
    inbox.notify(input.conversationId)
    startInBackground(input.conversationId)
    return message
  }

  // The owner taps Retry on a message that did not get through: the SAME message goes back to the
  // inbox (pending), the agent is notified and its session started. Delivered ones stay as they are.
  const retryMessage = async (conversationId: string, messageId: string): Promise<Message> => {
    await requireConversation(conversationId)
    const message = await store.messages.get(messageId)
    if (!message || message.conversationId !== conversationId) throw new Error(`message ${messageId} not found in ${conversationId}`)
    if (message.role !== 'user') throw new Error(`message ${messageId} is not a message to the agent`)
    if (message.status === 'delivered') return message
    await store.messages.requeue(messageId, now())
    await store.conversations.touch(conversationId, now())
    const requeued: Message = { ...message, status: 'pending', retriedAt: now() }
    bus.publish({ type: 'message', conversationId, message: requeued })
    await publishConversation(conversationId)
    inbox.notify(conversationId)
    startInBackground(conversationId)
    return requeued
  }

  const sendUserMessage = (input: { conversationId: string, text: string, attachments?: Attachment[], transcript?: string | null }): Promise<Message> =>
    toAgent({ ...input, origin: 'user' })

  // For features (a mail reply came in, a doc changed): the agent gets it like a message from the
  // owner, the app shows it as a small note instead of their bubble.
  const sendSystemNote = (conversationId: string, text: string): Promise<Message> =>
    toAgent({ conversationId, text, origin: 'system' })

  // Called by the channel (long poll). Returns pending messages, waiting up to waitMs for new ones.
  const takePending = async (conversationId: string, waitMs: number): Promise<Message[]> => {
    const pending = await store.messages.pending(conversationId)
    if (pending.length > 0 || waitMs <= 0) return pending
    await inbox.wait(conversationId, waitMs)
    return store.messages.pending(conversationId)
  }

  const ack = async (ids: string[]): Promise<void> => {
    if (ids.length === 0) return
    await store.messages.markDelivered(ids, now())
    const byConversation = new Map<string, string[]>()
    for (const id of ids) {
      const row = await store.messages.get(id)
      if (!row) continue
      byConversation.set(row.conversationId, [...(byConversation.get(row.conversationId) ?? []), id])
    }
    for (const [conversationId, messageIds] of byConversation) {
      bus.publish({ type: 'delivered', conversationId, messageIds })
      await store.conversations.touch(conversationId, now())
      await setActivity(conversationId, 'Thinking')
    }
  }

  const postAssistant = async (conversationId: string, text: string, attachments: Attachment[] = []): Promise<Message> => {
    const { conversation, agent } = await requireConversation(conversationId)
    const message = await store.messages.add({ conversationId, role: 'assistant', text, attachments, status: 'delivered' }, now())
    await store.conversations.touch(conversationId, now())
    bus.publish({ type: 'message', conversationId, message })
    const body = text.trim() || (attachments.length > 0 ? `Sent ${attachments.length} file(s)` : '')
    const title = conversation.title === MAIN_TITLE ? agent.name : `${agent.name}: ${conversation.title}`
    try {
      await deps.push({ title, body: excerpt(body), url: deps.conversationUrl(conversationId) })
    }
    catch (err) {
      console.error(`[chat] push failed for conversation ${conversationId}`, err)
    }
    return message
  }

  const assistantReply = async (input: { conversationId: string, text: string, attachments?: Attachment[] }): Promise<Message> => {
    await setActivity(input.conversationId, null)
    return postAssistant(input.conversationId, input.text, input.attachments)
  }

  const hook = async (conversationId: string, event: HookEvent): Promise<void> => {
    if (!(await store.conversations.get(conversationId))) return
    switch (event.hook_event_name) {
      case 'SessionStart':
        if (event.session_id) await store.conversations.setClaudeSessionId(conversationId, event.session_id)
        return
      case 'UserPromptSubmit':
        // Activity counts as being active: keeps the chat "working" and its session from idling out.
        await store.conversations.touch(conversationId, now())
        await setActivity(conversationId, 'Thinking')
        return
      case 'PreToolUse': {
        const activity = describeTool(event.tool_name ?? '', event.tool_input ?? {}, deps.channelServer)
        if (!activity) return
        await store.conversations.touch(conversationId, now())
        await setActivity(conversationId, activity)
        return
      }
      case 'Stop':
        await setActivity(conversationId, null)
    }
  }

  const mainConversationFor = async (agentId: string): Promise<Conversation> => {
    const existing = (await store.conversations.list())
      .filter(c => c.agentId === agentId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0]
    return existing ?? store.conversations.create({ agentId, title: MAIN_TITLE }, now())
  }

  // For scripts and crons (`koopa notify "text"`): lands in an agent's main chat. Without an
  // agent, the always-on one (else the first).
  const notify = async (input: { text: string, agentName?: string, agentId?: string, conversationId?: string }): Promise<Message> => {
    if (input.conversationId) return postAssistant(input.conversationId, input.text)
    const agents = await store.agents.list()
    const wanted = input.agentName?.toLowerCase()
    const agent = input.agentId
      ? agents.find(a => a.id === input.agentId)
      : wanted
        ? agents.find(a => a.name.toLowerCase() === wanted)
        : (agents.find(a => a.alwaysOn) ?? agents[0])
    if (!agent) throw new Error(`no agent found for notify (${input.agentId ?? input.agentName ?? 'default'})`)
    return postAssistant((await mainConversationFor(agent.id)).id, input.text)
  }

  // Runs on a timer: keep always-on agents' main chats running, stop idle side chats.
  const supervise = async (): Promise<void> => {
    const agents = await store.agents.list()
    const keep = new Set<string>()
    for (const agent of agents.filter(a => a.alwaysOn)) {
      const main = await mainConversationFor(agent.id)
      keep.add(main.id)
      try {
        await ensureSession(main.id)
      }
      catch (err) {
        console.error(`[supervise] could not start ${agent.name}`, err)
      }
    }
    // Conversations with messages waiting (e.g. sent before claude was logged in).
    const running = new Set(await sessions.listRunning())
    for (const conversation of await store.conversations.list()) {
      if (running.has(conversation.id) || keep.has(conversation.id)) continue
      if ((await store.messages.pending(conversation.id)).length === 0) continue
      await ensureSession(conversation.id).catch(err => console.error(`[supervise] could not start ${conversation.id}`, err))
    }

    const idleMs = deps.idleHours * 3600_000
    for (const conversationId of await sessions.listRunning()) {
      if (keep.has(conversationId)) continue
      const conversation = await store.conversations.get(conversationId)
      if (!conversation || now().getTime() - conversation.lastActivityAt.getTime() > idleMs) {
        await sessions.stop(conversationId)
      }
    }
  }

  return { sendUserMessage, sendSystemNote, retryMessage, takePending, ack, assistantReply, hook, notify, supervise, ensureSession, mainConversationFor }
}

export type Chat = ReturnType<typeof createChat>
