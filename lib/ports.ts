// The storage port of agent chat. Both adapters (lib/storage/sqlite, lib/storage/pg) return
// exactly these shapes, so services and routes never see the dialect.

export type MessageRole = 'user' | 'assistant' | 'system'
export type MessageStatus = 'pending' | 'delivered' | 'failed'
// Who wrote a message the agent receives: the owner ('user') or the app itself ('system', e.g. a
// mail reply arrived). Both go through the inbox; the app shows a system note as a small line.
export type MessageOrigin = 'user' | 'system'

export interface Attachment {
  id: string
  name: string
  mime: string
  size: number
  path: string
  kind: 'image' | 'audio' | 'file'
}

export interface Agent {
  id: string
  name: string
  cwd: string
  alwaysOn: boolean
  instructions: string | null
  // Extra claude arguments, space separated (e.g. "--channels plugin:telegram@claude-plugins-official").
  extraArgs: string | null
  // Claude settings JSON merged into every session of this agent (e.g. enabledPlugins).
  settings: string | null
  createdAt: Date
}

export interface Conversation {
  id: string
  agentId: string
  title: string
  claudeSessionId: string | null
  activity: string | null
  archived: boolean
  lastActivityAt: Date
  createdAt: Date
}

export interface Message {
  id: string
  conversationId: string
  role: MessageRole
  text: string
  attachments: Attachment[]
  transcript: string | null
  status: MessageStatus
  origin: MessageOrigin
  createdAt: Date
  deliveredAt: Date | null
  // Last time the owner tapped Retry: the "did not arrive" clock starts again from here.
  retriedAt: Date | null
}

export interface PushSubscriptionRow {
  endpoint: string
  p256dh: string
  auth: string
  userAgent: string | null
  createdAt: Date
}

export interface NewAgent {
  name: string
  cwd: string
  alwaysOn?: boolean
  instructions?: string | null
  extraArgs?: string | null
  settings?: string | null
}

export interface NewConversation {
  agentId: string
  title: string
}

export interface NewMessage {
  conversationId: string
  role: MessageRole
  text: string
  status: MessageStatus
  attachments?: Attachment[]
  transcript?: string | null
  origin?: MessageOrigin
}

export interface NewPushSubscription {
  endpoint: string
  p256dh: string
  auth: string
  userAgent?: string | null
}

export interface ChatStore {
  agents: {
    create: (input: NewAgent, now?: Date) => Promise<Agent>
    get: (id: string) => Promise<Agent | undefined>
    // Oldest first.
    list: () => Promise<Agent[]>
    update: (id: string, patch: Partial<NewAgent>) => Promise<void>
  }
  conversations: {
    create: (input: NewConversation, now?: Date) => Promise<Conversation>
    get: (id: string) => Promise<Conversation | undefined>
    // Newest activity first; archived ones only when asked.
    list: (opts?: { includeArchived?: boolean }) => Promise<Conversation[]>
    touch: (id: string, now?: Date) => Promise<void>
    setClaudeSessionId: (id: string, sessionId: string) => Promise<void>
    setActivity: (id: string, activity: string | null) => Promise<void>
    setArchived: (id: string, archived: boolean) => Promise<void>
    rename: (id: string, title: string) => Promise<void>
  }
  messages: {
    add: (input: NewMessage, now?: Date) => Promise<Message>
    get: (id: string) => Promise<Message | undefined>
    // Newest `limit` messages (optionally older than `before`), returned oldest first.
    list: (conversationId: string, opts?: { limit?: number, before?: Date }) => Promise<Message[]>
    // Pending messages to the agent, oldest first.
    pending: (conversationId: string) => Promise<Message[]>
    markDelivered: (ids: string[], now?: Date) => Promise<void>
    setTranscript: (id: string, transcript: string) => Promise<void>
    // Back in the inbox: a failed or stuck message goes to pending again (same row). Delivered stays.
    requeue: (id: string, now?: Date) => Promise<void>
    // The newest message per conversation that the owner or the agent wrote (no app notes).
    last: () => Promise<Map<string, Message>>
    // The owner's messages to the agent that did not get through: failed, or still pending since
    // before `pendingBefore` (counted from the last retry). App notes never count.
    undelivered: (pendingBefore: Date) => Promise<Message[]>
    // Whether this exact system note is already in the conversation (dedupe after a restart).
    hasSystemNote: (conversationId: string, text: string) => Promise<boolean>
  }
  push: {
    save: (input: NewPushSubscription, now?: Date) => Promise<void>
    list: () => Promise<PushSubscriptionRow[]>
    delete: (endpoint: string) => Promise<void>
  }
  // A trivial query: the database answers (health checks).
  ping: () => Promise<void>
}
