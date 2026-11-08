import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import type { Attachment, MessageOrigin, MessageRole, MessageStatus } from '../../ports'

// Koopa's original core tables. Never change a column here without a new migration: existing
// databases (Koopa, Toadette) were created from these exact definitions.

export const agents = sqliteTable('agents', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  cwd: text('cwd').notNull(),
  alwaysOn: integer('always_on', { mode: 'boolean' }).notNull().default(false),
  instructions: text('instructions'),
  extraArgs: text('extra_args'),
  settings: text('settings'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})

export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull().references(() => agents.id),
  title: text('title').notNull(),
  claudeSessionId: text('claude_session_id'),
  activity: text('activity'),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  lastActivityAt: integer('last_activity_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, table => [
  index('conversations_agent_idx').on(table.agentId),
])

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull().references(() => conversations.id),
  role: text('role').$type<MessageRole>().notNull(),
  text: text('text').notNull(),
  attachments: text('attachments', { mode: 'json' }).$type<Attachment[]>().notNull().default([]),
  transcript: text('transcript'),
  status: text('status').$type<MessageStatus>().notNull(),
  origin: text('origin').$type<MessageOrigin>().notNull().default('user'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  deliveredAt: integer('delivered_at', { mode: 'timestamp_ms' }),
  retriedAt: integer('retried_at', { mode: 'timestamp_ms' }),
}, table => [
  index('messages_conversation_idx').on(table.conversationId, table.createdAt),
])

export const pushSubscriptions = sqliteTable('push_subscriptions', {
  endpoint: text('endpoint').primaryKey(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  userAgent: text('user_agent'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})
