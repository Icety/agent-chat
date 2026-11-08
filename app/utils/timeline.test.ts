import { expect, test } from 'bun:test'
import type { ChatMessage } from '../../shared/types'
import { mergeTimeline, type ChatTimelineItem } from './timeline'

const message = (id: string, at: string): ChatMessage =>
  ({ id, conversationId: 'c', role: 'user', origin: 'user', text: id, transcript: null, status: 'delivered', attachments: [], createdAt: at, retriedAt: null })
const item = (id: string, at: string): ChatTimelineItem => ({ id, at, component: {}, props: {} })

test('feature cards sit between the messages by time, then id, with ids namespaced per provider', () => {
  const messages = [message('m-z', '2026-10-15T12:24:00.000Z'), message('m-a', '2026-10-15T12:24:00.000Z'), message('m3', '2026-10-15T12:30:00.000Z')]
  const entries = mergeTimeline(messages, {
    mail: [item('d1', '2026-10-15T12:28:00.000Z'), item('d2', '2026-10-15T14:28:00+02:00')],
    projects: [item('d1', '2026-10-15T12:28:00.000Z')],
  })

  expect(entries.map(e => e.id)).toEqual(['m-z', 'm-a', 'mail:d1', 'mail:d2', 'projects:d1', 'm3'])
})
