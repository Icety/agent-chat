import { and, asc, desc, eq, inArray, lt, ne, or, sql } from 'drizzle-orm'
import type { ChatSqliteDb } from './client'
import { agents, conversations, messages, pushSubscriptions } from './schema'
import type { Agent, Conversation, Message, NewAgent, NewConversation, NewMessage, NewPushSubscription, PushSubscriptionRow } from '../../ports'

// Synchronous repos on bun:sqlite. The async ChatStore (store.ts) wraps them; SQLite hosts whose
// own features read chat rows in one transaction with theirs may call these directly.

type Db = ChatSqliteDb

export const createAgent = (db: Db, input: NewAgent, now: Date = new Date()): Agent => {
  const row: Agent = {
    id: crypto.randomUUID(),
    name: input.name,
    cwd: input.cwd,
    alwaysOn: input.alwaysOn ?? false,
    instructions: input.instructions ?? null,
    extraArgs: input.extraArgs ?? null,
    settings: input.settings ?? null,
    createdAt: now,
  }
  db.insert(agents).values(row).run()
  return row
}

export const getAgent = (db: Db, id: string): Agent | undefined =>
  db.select().from(agents).where(eq(agents.id, id)).get()

export const listAgents = (db: Db): Agent[] =>
  db.select().from(agents).orderBy(asc(agents.createdAt)).all()

export const updateAgent = (db: Db, id: string, patch: Partial<NewAgent>): void => {
  db.update(agents).set(patch).where(eq(agents.id, id)).run()
}

export const createConversation = (db: Db, input: NewConversation, now: Date = new Date()): Conversation => {
  const row: Conversation = {
    id: crypto.randomUUID(),
    agentId: input.agentId,
    title: input.title,
    claudeSessionId: null,
    activity: null,
    archived: false,
    lastActivityAt: now,
    createdAt: now,
  }
  db.insert(conversations).values(row).run()
  return row
}

export const getConversation = (db: Db, id: string): Conversation | undefined =>
  db.select().from(conversations).where(eq(conversations.id, id)).get()

export const listConversations = (db: Db, opts: { includeArchived?: boolean } = {}): Conversation[] => {
  const query = db.select().from(conversations)
  const filtered = opts.includeArchived ? query : query.where(eq(conversations.archived, false))
  return filtered.orderBy(desc(conversations.lastActivityAt)).all()
}

export const touchConversation = (db: Db, id: string, now: Date = new Date()): void => {
  db.update(conversations).set({ lastActivityAt: now }).where(eq(conversations.id, id)).run()
}

export const setClaudeSessionId = (db: Db, id: string, sessionId: string): void => {
  db.update(conversations).set({ claudeSessionId: sessionId }).where(eq(conversations.id, id)).run()
}

export const setActivity = (db: Db, id: string, activity: string | null): void => {
  db.update(conversations).set({ activity }).where(eq(conversations.id, id)).run()
}

export const setArchived = (db: Db, id: string, archived: boolean): void => {
  db.update(conversations).set({ archived }).where(eq(conversations.id, id)).run()
}

export const renameConversation = (db: Db, id: string, title: string): void => {
  db.update(conversations).set({ title }).where(eq(conversations.id, id)).run()
}

export const addMessage = (db: Db, input: NewMessage, now: Date = new Date()): Message => {
  const row: Message = {
    id: crypto.randomUUID(),
    conversationId: input.conversationId,
    role: input.role,
    text: input.text,
    attachments: input.attachments ?? [],
    transcript: input.transcript ?? null,
    status: input.status,
    origin: input.origin ?? 'user',
    createdAt: now,
    deliveredAt: input.status === 'delivered' ? now : null,
    retriedAt: null,
  }
  db.insert(messages).values(row).run()
  return row
}

export const getMessage = (db: Db, id: string): Message | undefined =>
  db.select().from(messages).where(eq(messages.id, id)).get()

export const listMessages = (db: Db, conversationId: string, opts: { limit?: number, before?: Date } = {}): Message[] => {
  const where = opts.before
    ? and(eq(messages.conversationId, conversationId), lt(messages.createdAt, opts.before))
    : eq(messages.conversationId, conversationId)
  return db.select().from(messages)
    .where(where)
    .orderBy(desc(messages.createdAt))
    .limit(opts.limit ?? 200)
    .all()
    .reverse()
}

export const pendingForConversation = (db: Db, conversationId: string): Message[] =>
  db.select().from(messages)
    .where(and(eq(messages.conversationId, conversationId), eq(messages.role, 'user'), eq(messages.status, 'pending')))
    .orderBy(asc(messages.createdAt))
    .all()

export const markDelivered = (db: Db, ids: string[], now: Date = new Date()): void => {
  if (ids.length === 0) return
  db.update(messages).set({ status: 'delivered', deliveredAt: now }).where(inArray(messages.id, ids)).run()
}

export const setTranscript = (db: Db, id: string, transcript: string): void => {
  db.update(messages).set({ transcript }).where(eq(messages.id, id)).run()
}

export const requeueMessage = (db: Db, id: string, now: Date = new Date()): void => {
  db.update(messages).set({ status: 'pending', retriedAt: now }).where(and(eq(messages.id, id), ne(messages.status, 'delivered'))).run()
}

export const lastMessages = (db: Db): Map<string, Message> => {
  const rows = db.select().from(messages)
    .where(and(
      ne(messages.origin, 'system'),
      sql`${messages.createdAt} = (select max(m2.created_at) from messages m2 where m2.conversation_id = ${messages.conversationId} and m2.origin != 'system')`,
    ))
    .all()
  return new Map(rows.map(m => [m.conversationId, m]))
}

export const undeliveredMessages = (db: Db, pendingBefore: Date): Message[] =>
  db.select().from(messages)
    .where(and(
      eq(messages.role, 'user'),
      eq(messages.origin, 'user'),
      or(
        eq(messages.status, 'failed'),
        and(eq(messages.status, 'pending'), lt(sql`coalesce(${messages.retriedAt}, ${messages.createdAt})`, pendingBefore.getTime())),
      ),
    ))
    .orderBy(asc(messages.createdAt))
    .all()

export const hasSystemNote = (db: Db, conversationId: string, text: string): boolean =>
  Boolean(db.select({ id: messages.id }).from(messages)
    .where(and(eq(messages.conversationId, conversationId), eq(messages.origin, 'system'), eq(messages.text, text)))
    .get())

export const savePushSubscription = (db: Db, input: NewPushSubscription, now: Date = new Date()): void => {
  const row: PushSubscriptionRow = {
    endpoint: input.endpoint,
    p256dh: input.p256dh,
    auth: input.auth,
    userAgent: input.userAgent ?? null,
    createdAt: now,
  }
  db.insert(pushSubscriptions).values(row)
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { p256dh: row.p256dh, auth: row.auth, userAgent: row.userAgent } })
    .run()
}

export const listPushSubscriptions = (db: Db): PushSubscriptionRow[] =>
  db.select().from(pushSubscriptions).all()

export const deletePushSubscription = (db: Db, endpoint: string): void => {
  db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint)).run()
}
