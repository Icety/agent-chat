import { computed, shallowReactive, type ComputedRef, type Ref } from 'vue'
import type { ChatTimelineItem } from '../utils/timeline'

// Called once per open chat, inside the chat's setup, so it may use composables (useFetch,
// useLiveTopic, ...). Returns the items to show in that conversation.
export type ChatTimelineProvider = (conversationId: Ref<string>) => ComputedRef<ChatTimelineItem[]>

const providers = shallowReactive(new Map<string, ChatTimelineProvider>())

// Register from a client plugin of your layer: registerChatTimeline('mail', conversationId => ...).
// Returns a function that removes the provider again.
export const registerChatTimeline = (key: string, provider: ChatTimelineProvider): (() => void) => {
  providers.set(key, provider)
  return () => {
    if (providers.get(key) === provider) providers.delete(key)
  }
}

// For ChatPanel: every registered provider's items for this conversation, by provider key.
export const useChatTimeline = (conversationId: Ref<string>): ComputedRef<Record<string, ChatTimelineItem[]>> => {
  const sources = [...providers.entries()].map(([key, provider]) => ({ key, provider, items: provider(conversationId) }))
  return computed(() => Object.fromEntries(
    sources.filter(s => providers.get(s.key) === s.provider).map(s => [s.key, s.items.value]),
  ))
}
