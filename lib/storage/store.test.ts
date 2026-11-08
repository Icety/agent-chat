import { describe, expect, test } from 'bun:test'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import type { ChatStore } from '../ports'
import { openSqliteChatDb } from './sqlite/client'
import { createSqliteChatStore } from './sqlite/store'
import { createPgChatStore } from './pg/store'
import { pgChatMigrations } from './pg/migrate'

// One storage contract, run against both adapters: the Postgres one has its own SQL for the
// preview, undelivered and dedupe queries, so it needs the same proof as SQLite.
const adapters: [string, () => Promise<ChatStore>][] = [
  ['sqlite', async () => createSqliteChatStore(openSqliteChatDb(':memory:'))],
  ['postgres', async () => {
    const db = drizzle(new PGlite())
    await migrate(db, { migrationsFolder: pgChatMigrations })
    return createPgChatStore(db)
  }],
]

const at = (iso: string): Date => new Date(iso)

describe.each(adapters)('%s store', (_, open) => {
  test('agents: create, read back, update', async () => {
    const store = await open()
    const agent = await store.agents.create({ name: 'A', cwd: '/home/a', alwaysOn: true }, at('2026-10-07T10:00:00Z'))
    await store.agents.update(agent.id, { name: 'B', extraArgs: '--channels x' })
    expect(await store.agents.get(agent.id)).toEqual({ ...agent, name: 'B', extraArgs: '--channels x' })
    expect((await store.agents.list()).map(a => a.alwaysOn)).toEqual([true])
  })

  test('conversations: newest activity first, archived hidden by default, updates stick', async () => {
    const store = await open()
    const agent = await store.agents.create({ name: 'A', cwd: '/tmp' }, at('2026-10-07T10:00:00Z'))
    const older = await store.conversations.create({ agentId: agent.id, title: 'old' }, at('2026-10-07T10:00:00Z'))
    const newer = await store.conversations.create({ agentId: agent.id, title: 'new' }, at('2026-10-07T11:00:00Z'))
    const archived = await store.conversations.create({ agentId: agent.id, title: 'gone' }, at('2026-10-07T12:00:00Z'))
    await store.conversations.setArchived(archived.id, true)
    expect((await store.conversations.list()).map(c => c.id)).toEqual([newer.id, older.id])

    await store.conversations.touch(older.id, at('2026-10-07T13:00:00Z'))
    await store.conversations.setClaudeSessionId(older.id, 'sess-1')
    await store.conversations.setActivity(older.id, 'Editing notes.md')
    await store.conversations.rename(older.id, 'Groceries')
    expect((await store.conversations.list())[0]).toMatchObject({ id: older.id, claudeSessionId: 'sess-1', activity: 'Editing notes.md', title: 'Groceries' })
    expect(await store.conversations.list({ includeArchived: true })).toHaveLength(3)
  })

  test('messages: pending in order, delivered once acked, cursor and limit, attachments and transcript round-trip', async () => {
    const store = await open()
    const agent = await store.agents.create({ name: 'A', cwd: '/tmp' })
    const conv = await store.conversations.create({ agentId: agent.id, title: 'x' })
    const voice = { id: 'a1', name: 'voice.webm', mime: 'audio/webm', size: 10, path: '/data/a1', kind: 'audio' as const }
    const first = await store.messages.add({ conversationId: conv.id, role: 'user', text: 'one', status: 'pending', attachments: [voice] }, at('2026-10-07T10:01:00Z'))
    const second = await store.messages.add({ conversationId: conv.id, role: 'user', text: 'two', status: 'pending' }, at('2026-10-07T10:02:00Z'))
    await store.messages.add({ conversationId: conv.id, role: 'assistant', text: 'hi', status: 'delivered' }, at('2026-10-07T10:03:00Z'))
    expect((await store.messages.pending(conv.id)).map(m => m.text)).toEqual(['one', 'two'])

    await store.messages.markDelivered([first.id], at('2026-10-07T10:04:00Z'))
    await store.messages.setTranscript(first.id, 'hallo daar')
    expect((await store.messages.pending(conv.id)).map(m => m.id)).toEqual([second.id])
    expect(await store.messages.get(first.id)).toMatchObject({ status: 'delivered', deliveredAt: at('2026-10-07T10:04:00Z'), transcript: 'hallo daar', attachments: [voice] })
    expect((await store.messages.list(conv.id)).map(m => m.text)).toEqual(['one', 'two', 'hi'])
    expect((await store.messages.list(conv.id, { limit: 2 })).map(m => m.text)).toEqual(['two', 'hi'])
    expect((await store.messages.list(conv.id, { limit: 2, before: at('2026-10-07T10:03:00Z') })).map(m => m.text)).toEqual(['one', 'two'])
  })

  test('requeue sends a failed message back to pending but never touches a delivered one', async () => {
    const store = await open()
    const agent = await store.agents.create({ name: 'A', cwd: '/tmp' })
    const conv = await store.conversations.create({ agentId: agent.id, title: 'x' })
    const failed = await store.messages.add({ conversationId: conv.id, role: 'user', text: 'f', status: 'failed' })
    const done = await store.messages.add({ conversationId: conv.id, role: 'user', text: 'd', status: 'delivered' })
    await store.messages.requeue(failed.id, at('2026-10-07T10:05:00Z'))
    await store.messages.requeue(done.id, at('2026-10-07T10:05:00Z'))
    expect(await store.messages.get(failed.id)).toMatchObject({ status: 'pending', retriedAt: at('2026-10-07T10:05:00Z') })
    expect(await store.messages.get(done.id)).toMatchObject({ status: 'delivered', retriedAt: null })
  })

  test('last message per chat leaves app notes out; undelivered counts failed and old pending, from the last retry, never notes', async () => {
    const store = await open()
    const agent = await store.agents.create({ name: 'A', cwd: '/va' })
    const a = await store.conversations.create({ agentId: agent.id, title: 'A' })
    const b = await store.conversations.create({ agentId: agent.id, title: 'B' })
    await store.messages.add({ conversationId: a.id, role: 'user', text: 'first', status: 'delivered' }, at('2026-10-15T10:00:00Z'))
    await store.messages.add({ conversationId: a.id, role: 'assistant', text: 'second', status: 'delivered' }, at('2026-10-15T10:01:00Z'))
    await store.messages.add({ conversationId: a.id, role: 'user', text: 'note', status: 'pending', origin: 'system' }, at('2026-10-15T10:02:00Z'))
    const last = await store.messages.last()
    expect(last.get(a.id)?.text).toBe('second')
    expect(last.has(b.id)).toBe(false)

    const stuck = await store.messages.add({ conversationId: b.id, role: 'user', text: 'stuck', status: 'pending' }, at('2026-10-15T12:00:00Z'))
    const lost = await store.messages.add({ conversationId: b.id, role: 'user', text: 'lost', status: 'failed' }, at('2026-10-15T12:29:00Z'))
    await store.messages.add({ conversationId: b.id, role: 'user', text: 'fresh', status: 'pending' }, at('2026-10-15T12:25:00Z'))
    const retried = await store.messages.add({ conversationId: b.id, role: 'user', text: 'retried', status: 'pending' }, at('2026-10-15T09:00:00Z'))
    await store.messages.requeue(retried.id, at('2026-10-15T12:25:00Z'))
    expect((await store.messages.undelivered(at('2026-10-15T12:20:00Z'))).map(m => m.id)).toEqual([stuck.id, lost.id])
  })

  test('hasSystemNote finds only the exact note of that conversation', async () => {
    const store = await open()
    const agent = await store.agents.create({ name: 'A', cwd: '/tmp' })
    const a = await store.conversations.create({ agentId: agent.id, title: 'A' })
    const b = await store.conversations.create({ agentId: agent.id, title: 'B' })
    await store.messages.add({ conversationId: a.id, role: 'user', text: 'Acme replied', status: 'pending', origin: 'system' })
    await store.messages.add({ conversationId: a.id, role: 'user', text: 'typed by the owner', status: 'pending' })
    expect(await store.messages.hasSystemNote(a.id, 'Acme replied')).toBe(true)
    expect(await store.messages.hasSystemNote(b.id, 'Acme replied')).toBe(false)
    expect(await store.messages.hasSystemNote(a.id, 'typed by the owner')).toBe(false)
  })

  test('push subscriptions upsert by endpoint and delete', async () => {
    const store = await open()
    await store.push.save({ endpoint: 'https://push/1', p256dh: 'k', auth: 'a' })
    await store.push.save({ endpoint: 'https://push/1', p256dh: 'k2', auth: 'a2' })
    expect((await store.push.list()).map(s => s.p256dh)).toEqual(['k2'])
    await store.push.delete('https://push/1')
    expect(await store.push.list()).toEqual([])
    await store.ping()
  })
})
