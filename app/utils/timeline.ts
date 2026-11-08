import type { Component } from 'vue'
import type { ChatMessage } from '../../shared/types'

// Something a feature shows between the messages of a chat, e.g. a mail draft card.
export interface ChatTimelineItem {
  // Unique within its provider; the timeline namespaces it as `<provider key>:<id>`.
  id: string
  // ISO time it sits at in the chat.
  at: string
  component: Component
  props: Record<string, unknown>
}

export type ChatTimelineEntry =
  | { kind: 'message', id: string, at: string, message: ChatMessage }
  | { kind: 'item', id: string, at: string, item: ChatTimelineItem }

// Messages plus every provider's items, by time, then by id. Messages keep their own order.
export const mergeTimeline = (messages: ChatMessage[], itemsByKey: Record<string, ChatTimelineItem[]>): ChatTimelineEntry[] => {
  const entries: ChatTimelineEntry[] = [
    ...messages.map(message => ({ kind: 'message' as const, id: message.id, at: message.createdAt, message })),
    ...Object.entries(itemsByKey).flatMap(([key, items]) =>
      items.map(item => ({ kind: 'item' as const, id: `${key}:${item.id}`, at: item.at, item }))),
  ]
  const order = new Map(entries.map((e, i) => [e, i]))
  return entries.sort((a, b) => {
    const byTime = Date.parse(a.at) - Date.parse(b.at)
    if (byTime !== 0) return byTime
    if (a.kind === 'message' && b.kind === 'message') return (order.get(a) ?? 0) - (order.get(b) ?? 0)
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}
