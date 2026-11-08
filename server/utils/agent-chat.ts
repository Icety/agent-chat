import { timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'
import { createAgentChat, type AgentChat, type AgentChatConfig } from '../../lib/runtime'
import type { TopicData, TopicName } from '../../shared/topics'

// What a host registers once (setAgentChatHost) before the first request.
export interface AgentChatHost extends AgentChatConfig {
  // Throws (401) unless the request comes from the app's owner. Every non-internal chat route calls it.
  requireOwner: (event: H3Event) => Promise<void>
}

let instance: AgentChat | undefined
let requireOwner: AgentChatHost['requireOwner'] | undefined

export const setAgentChatHost = (host: AgentChatHost): AgentChat => {
  instance = createAgentChat(host)
  requireOwner = host.requireOwner
  return instance
}

export const hasAgentChatHost = (): boolean => Boolean(instance)

export const useAgentChat = (): AgentChat => {
  if (!instance) throw new Error('[agent-chat] no host registered: call setAgentChatHost() in a server plugin')
  return instance
}

export const requireChatOwner = async (event: H3Event): Promise<void> => {
  if (!requireOwner) throw createError({ statusCode: 503, statusMessage: 'Chat is not set up on this server' })
  await requireOwner(event)
}

// The token is the real gate. The address check only rejects requests that are known to come
// from elsewhere (Bun does not always report the peer address).
const isRemote = (address: string | undefined): boolean =>
  Boolean(address) && !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address ?? '')

const sameToken = (given: string, expected: string): boolean => {
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

// /api/internal/*: the channel, hooks and scripts on this machine only.
export const requireChatInternal = (event: H3Event): void => {
  const token = (getHeader(event, 'authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (isRemote(getRequestIP(event)) || !token || !sameToken(token, useAgentChat().internalToken)) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
}

// Tell every open app that something changed, e.g. publishChatTopic('mail.draft', { draftId }).
export const publishChatTopic = <K extends TopicName>(topic: K, data: TopicData<K>): void => {
  useAgentChat().bus.publish({ type: 'topic', topic, data })
}

export const defineOwnerHandler = <T>(handler: (event: H3Event) => T | Promise<T>) => defineEventHandler(async event => {
  await requireChatOwner(event)
  return handler(event)
})

export const defineInternalHandler = <T>(handler: (event: H3Event) => T | Promise<T>) => defineEventHandler(async event => {
  requireChatInternal(event)
  return handler(event)
})
