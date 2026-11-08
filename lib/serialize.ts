import type { Agent, Attachment, Conversation, Message } from './ports'
import type { ChatEvent } from './bus'
import type { AgentSummary, ChatMessage, ConversationSummary, PublicAttachment, WireEvent } from '../shared/types'

export const publicAttachment = (a: Attachment): PublicAttachment => ({
  id: a.id, name: a.name, mime: a.mime, size: a.size, kind: a.kind, url: `/api/files/${a.id}`,
})

export const publicMessage = (m: Message): ChatMessage => ({
  id: m.id,
  conversationId: m.conversationId,
  role: m.role,
  text: m.text,
  transcript: m.transcript,
  status: m.status,
  origin: m.origin,
  attachments: m.attachments.map(publicAttachment),
  createdAt: m.createdAt.toISOString(),
  retriedAt: m.retriedAt?.toISOString() ?? null,
})

export const publicConversation = (c: Conversation): ConversationSummary => ({
  id: c.id,
  agentId: c.agentId,
  title: c.title,
  activity: c.activity,
  archived: c.archived,
  lastActivityAt: c.lastActivityAt.toISOString(),
  createdAt: c.createdAt.toISOString(),
})

export const publicAgent = (a: Agent): AgentSummary => ({
  id: a.id, name: a.name, cwd: a.cwd, alwaysOn: a.alwaysOn, extraArgs: a.extraArgs, createdAt: a.createdAt.toISOString(),
})

// Marks a system note so the agent never mistakes it for the owner (it may quote outside mail).
export const systemNotePrefix = (names: { appName: string, ownerName: string }): string =>
  `[${names.appName} app note, not typed by ${names.ownerName}]`

// What the channel receives from the inbox (shape fixed by channel/lib.ts InboxMessage).
export const inboxMessage = (m: Message, notePrefix: string) => ({
  id: m.id,
  text: m.origin === 'system' ? `${notePrefix} ${m.text}` : m.text,
  transcript: m.transcript,
  attachments: m.attachments.map(a => ({ path: a.path, kind: a.kind, name: a.name })),
  createdAt: m.createdAt.toISOString(),
})

// A bus event as the browser receives it on /api/events.
export const wireEvent = (e: ChatEvent): WireEvent => {
  switch (e.type) {
    case 'message': return { type: e.type, conversationId: e.conversationId, message: publicMessage(e.message) }
    case 'conversation': return { type: e.type, conversation: publicConversation(e.conversation) }
    case 'topic': return { type: e.type, topic: e.topic, data: e.data }
    default: return e
  }
}
