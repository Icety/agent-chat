import type { Conversation, Message } from './ports'

export type ChatEvent =
  | { type: 'message', conversationId: string, message: Message }
  | { type: 'delivered', conversationId: string, messageIds: string[] }
  | { type: 'activity', conversationId: string, activity: string | null }
  | { type: 'conversation', conversation: Conversation }
  // A live topic (shared/topics.ts): published by features through publishChatTopic().
  | { type: 'topic', topic: string, data: unknown }

export interface Bus<T> {
  subscribe: (fn: (event: T) => void) => () => void
  publish: (event: T) => void
}

export const createBus = <T>(): Bus<T> => {
  const listeners = new Set<(event: T) => void>()
  return {
    subscribe: fn => {
      listeners.add(fn)
      return () => { listeners.delete(fn) }
    },
    publish: event => {
      for (const fn of listeners) {
        try {
          fn(event)
        }
        catch (err) {
          console.error('[bus] listener failed', err)
        }
      }
    },
  }
}
