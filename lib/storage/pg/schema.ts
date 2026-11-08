import { pgSchema, text, boolean, timestamp, jsonb, index } from 'drizzle-orm/pg-core'
import type { Attachment, MessageOrigin, MessageRole, MessageStatus } from '../../ports'

// The chat tables on Postgres: the same names and columns as the SQLite ones, in Postgres types,
// inside their own schema `agent_chat` so they never collide with a host's own `messages` table.
// Hosts with their own drizzle-kit setup re-export these from their schema index.
export const agentChat = pgSchema('agent_chat')

const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' })

export const agents = agentChat.table('agents', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  cwd: text('cwd').notNull(),
  alwaysOn: boolean('always_on').notNull().default(false),
  instructions: text('instructions'),
  extraArgs: text('extra_args'),
  settings: text('settings'),
  createdAt: at('created_at').notNull(),
})

export const conversations = agentChat.table('conversations', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull().references(() => agents.id),
  title: text('title').notNull(),
  claudeSessionId: text('claude_session_id'),
  activity: text('activity'),
  archived: boolean('archived').notNull().default(false),
  lastActivityAt: at('last_activity_at').notNull(),
  createdAt: at('created_at').notNull(),
}, table => [
  index('conversations_agent_idx').on(table.agentId),
])

export const messages = agentChat.table('messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull().references(() => conversations.id),
  role: text('role').$type<MessageRole>().notNull(),
  text: text('text').notNull(),
  attachments: jsonb('attachments').$type<Attachment[]>().notNull().default([]),
  transcript: text('transcript'),
  status: text('status').$type<MessageStatus>().notNull(),
  origin: text('origin').$type<MessageOrigin>().notNull().default('user'),
  createdAt: at('created_at').notNull(),
  deliveredAt: at('delivered_at'),
  retriedAt: at('retried_at'),
}, table => [
  index('messages_conversation_idx').on(table.conversationId, table.createdAt),
])

export const pushSubscriptions = agentChat.table('push_subscriptions', {
  endpoint: text('endpoint').primaryKey(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  userAgent: text('user_agent'),
  createdAt: at('created_at').notNull(),
})
