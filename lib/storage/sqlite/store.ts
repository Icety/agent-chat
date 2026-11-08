import { sql } from 'drizzle-orm'
import type { ChatStore } from '../../ports'
import type { ChatSqliteDb } from './client'
import * as r from './repos'

// The ChatStore on SQLite: the sync repos, answered as promises.
export const createSqliteChatStore = (db: ChatSqliteDb): ChatStore => ({
  agents: {
    create: async (input, now) => r.createAgent(db, input, now),
    get: async id => r.getAgent(db, id),
    list: async () => r.listAgents(db),
    update: async (id, patch) => r.updateAgent(db, id, patch),
  },
  conversations: {
    create: async (input, now) => r.createConversation(db, input, now),
    get: async id => r.getConversation(db, id),
    list: async opts => r.listConversations(db, opts),
    touch: async (id, now) => r.touchConversation(db, id, now),
    setClaudeSessionId: async (id, sessionId) => r.setClaudeSessionId(db, id, sessionId),
    setActivity: async (id, activity) => r.setActivity(db, id, activity),
    setArchived: async (id, archived) => r.setArchived(db, id, archived),
    rename: async (id, title) => r.renameConversation(db, id, title),
  },
  messages: {
    add: async (input, now) => r.addMessage(db, input, now),
    get: async id => r.getMessage(db, id),
    list: async (conversationId, opts) => r.listMessages(db, conversationId, opts),
    pending: async conversationId => r.pendingForConversation(db, conversationId),
    markDelivered: async (ids, now) => r.markDelivered(db, ids, now),
    setTranscript: async (id, transcript) => r.setTranscript(db, id, transcript),
    requeue: async (id, now) => r.requeueMessage(db, id, now),
    last: async () => r.lastMessages(db),
    undelivered: async pendingBefore => r.undeliveredMessages(db, pendingBefore),
    hasSystemNote: async (conversationId, text) => r.hasSystemNote(db, conversationId, text),
  },
  push: {
    save: async (input, now) => r.savePushSubscription(db, input, now),
    list: async () => r.listPushSubscriptions(db),
    delete: async endpoint => r.deletePushSubscription(db, endpoint),
  },
  ping: async () => { db.run(sql`select 1`) },
})
