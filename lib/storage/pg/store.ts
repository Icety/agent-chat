import { and, asc, desc, eq, inArray, lt, ne, or, sql } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import type { Agent, ChatStore, Conversation, Message, PushSubscriptionRow } from '../../ports'
import { agents, conversations, messages, pushSubscriptions } from './schema'

// The ChatStore on any drizzle Postgres database (postgres-js, node-postgres, PGlite).
export const createPgChatStore = <H extends PgQueryResultHKT, S extends Record<string, unknown>>(db: PgDatabase<H, S>): ChatStore => {
  const first = <T>(rows: T[]): T | undefined => rows[0]

  return {
    agents: {
      create: async (input, now = new Date()) => {
        const row: Agent = {
          id: crypto.randomUUID(), name: input.name, cwd: input.cwd, alwaysOn: input.alwaysOn ?? false,
          instructions: input.instructions ?? null, extraArgs: input.extraArgs ?? null, settings: input.settings ?? null, createdAt: now,
        }
        await db.insert(agents).values(row)
        return row
      },
      get: async id => first(await db.select().from(agents).where(eq(agents.id, id)).limit(1)),
      list: async () => db.select().from(agents).orderBy(asc(agents.createdAt)),
      update: async (id, patch) => { await db.update(agents).set(patch).where(eq(agents.id, id)) },
    },
    conversations: {
      create: async (input, now = new Date()) => {
        const row: Conversation = {
          id: crypto.randomUUID(), agentId: input.agentId, title: input.title, claudeSessionId: null,
          activity: null, archived: false, lastActivityAt: now, createdAt: now,
        }
        await db.insert(conversations).values(row)
        return row
      },
      get: async id => first(await db.select().from(conversations).where(eq(conversations.id, id)).limit(1)),
      list: async (opts = {}) => db.select().from(conversations)
        .where(opts.includeArchived ? undefined : eq(conversations.archived, false))
        .orderBy(desc(conversations.lastActivityAt)),
      touch: async (id, now = new Date()) => { await db.update(conversations).set({ lastActivityAt: now }).where(eq(conversations.id, id)) },
      setClaudeSessionId: async (id, sessionId) => { await db.update(conversations).set({ claudeSessionId: sessionId }).where(eq(conversations.id, id)) },
      setActivity: async (id, activity) => { await db.update(conversations).set({ activity }).where(eq(conversations.id, id)) },
      setArchived: async (id, archived) => { await db.update(conversations).set({ archived }).where(eq(conversations.id, id)) },
      rename: async (id, title) => { await db.update(conversations).set({ title }).where(eq(conversations.id, id)) },
    },
    messages: {
      add: async (input, now = new Date()) => {
        const row: Message = {
          id: crypto.randomUUID(), conversationId: input.conversationId, role: input.role, text: input.text,
          attachments: input.attachments ?? [], transcript: input.transcript ?? null, status: input.status,
          origin: input.origin ?? 'user', createdAt: now, deliveredAt: input.status === 'delivered' ? now : null, retriedAt: null,
        }
        await db.insert(messages).values(row)
        return row
      },
      get: async id => first(await db.select().from(messages).where(eq(messages.id, id)).limit(1)),
      list: async (conversationId, opts = {}) => (await db.select().from(messages)
        .where(opts.before
          ? and(eq(messages.conversationId, conversationId), lt(messages.createdAt, opts.before))
          : eq(messages.conversationId, conversationId))
        .orderBy(desc(messages.createdAt))
        .limit(opts.limit ?? 200)).reverse(),
      pending: async conversationId => db.select().from(messages)
        .where(and(eq(messages.conversationId, conversationId), eq(messages.role, 'user'), eq(messages.status, 'pending')))
        .orderBy(asc(messages.createdAt)),
      markDelivered: async (ids, now = new Date()) => {
        if (ids.length === 0) return
        await db.update(messages).set({ status: 'delivered', deliveredAt: now }).where(inArray(messages.id, ids))
      },
      setTranscript: async (id, transcript) => { await db.update(messages).set({ transcript }).where(eq(messages.id, id)) },
      requeue: async (id, now = new Date()) => {
        await db.update(messages).set({ status: 'pending', retriedAt: now }).where(and(eq(messages.id, id), ne(messages.status, 'delivered')))
      },
      last: async () => {
        const rows = await db.select().from(messages).where(and(
          ne(messages.origin, 'system'),
          sql`${messages.createdAt} = (select max(m2.created_at) from ${messages} m2 where m2.conversation_id = ${messages.conversationId} and m2.origin != 'system')`,
        ))
        return new Map(rows.map(m => [m.conversationId, m]))
      },
      undelivered: async pendingBefore => db.select().from(messages)
        .where(and(
          eq(messages.role, 'user'),
          eq(messages.origin, 'user'),
          or(
            eq(messages.status, 'failed'),
            and(eq(messages.status, 'pending'), lt(sql`coalesce(${messages.retriedAt}, ${messages.createdAt})`, pendingBefore)),
          ),
        ))
        .orderBy(asc(messages.createdAt)),
      hasSystemNote: async (conversationId, text) => Boolean(first(await db.select({ id: messages.id }).from(messages)
        .where(and(eq(messages.conversationId, conversationId), eq(messages.origin, 'system'), eq(messages.text, text))).limit(1))),
    },
    push: {
      save: async (input, now = new Date()) => {
        const row: PushSubscriptionRow = { endpoint: input.endpoint, p256dh: input.p256dh, auth: input.auth, userAgent: input.userAgent ?? null, createdAt: now }
        await db.insert(pushSubscriptions).values(row)
          .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { p256dh: row.p256dh, auth: row.auth, userAgent: row.userAgent } })
      },
      list: async () => db.select().from(pushSubscriptions),
      delete: async endpoint => { await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint)) },
    },
    ping: async () => { await db.execute(sql`select 1`) },
  }
}
