export interface PublicAttachment {
  id: string
  name: string
  mime: string
  size: number
  kind: 'image' | 'audio' | 'file'
  url: string
}

export interface ChatMessage {
  id: string
  conversationId: string
  role: 'user' | 'assistant' | 'system'
  text: string
  transcript: string | null
  status: 'pending' | 'delivered' | 'failed'
  // 'system': a note from the app to the agent (shown as a small line, not the owner's bubble).
  origin: 'user' | 'system'
  attachments: PublicAttachment[]
  createdAt: string
  // Last Retry; a message still pending counts as not delivered 10 minutes after this (or createdAt).
  retriedAt: string | null
}

export interface ConversationSummary {
  id: string
  agentId: string
  title: string
  activity: string | null
  archived: boolean
  lastActivityAt: string
  createdAt: string
  // Last message, one line (shared/preview.ts). Only the list API sends it; null: no messages yet.
  preview?: string | null
}

export interface AgentSummary {
  id: string
  name: string
  cwd: string
  alwaysOn: boolean
  extraArgs: string | null
  createdAt: string
}

export interface Status {
  claudeVersion: string | null
  claudeLoggedIn: boolean | null
  runningConversations: string[]
  pushEnabled: boolean
  pushDevices: number
  voiceEnabled: boolean
}

export type WireEvent =
  | { type: 'message', conversationId: string, message: ChatMessage }
  | { type: 'delivered', conversationId: string, messageIds: string[] }
  | { type: 'activity', conversationId: string, activity: string | null }
  | { type: 'conversation', conversation: ConversationSummary }
  | { type: 'topic', topic: string, data: unknown }
  | { type: 'ping' }

// GET /api/chat/attention: what a home screen shows about chats.
export interface ChatAttention {
  // Chats with messages that did not arrive (failed, or pending too long).
  undelivered: { conversationId: string, count: number, title: string }[]
  // Running chats whose agent is working right now.
  atWork: { conversationId: string, agentId: string, title: string, activity: string | null }[]
}
