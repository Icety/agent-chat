<script setup lang="ts">
import type { ConversationSummary } from '../../shared/types'
import { activityIcon } from '../utils/activity'
import { isWorking } from '../../shared/working'

// One chat in a list: who, the title, what the agent is doing right now (or who it is), and when.
const props = withDefaults(defineProps<{
  conversation: ConversationSummary
  active?: boolean
  size?: 'sm' | 'md'
  /** Name the agent under the title when not working. */
  showAgent?: boolean
}>(), { active: false, size: 'sm', showAgent: true })

const { lookOf } = useAgents()
const { now, format } = useChatTime()
const path = useAppConfig().agentChat.conversationPath
const look = computed(() => lookOf(props.conversation.agentId))
const working = computed(() => isWorking(props.conversation, now.value))
const when = computed(() => working.value ? 'now' : format(props.conversation.lastActivityAt, 'relative'))
// Under the title: what the agent does now, else the last message, else who it is.
const line = computed(() => working.value
  ? props.conversation.activity ?? ''
  : props.conversation.preview || (props.showAgent ? look.value.label : ''))
</script>

<template>
  <NuxtLink
    :to="`${path}${props.conversation.id}`"
    class="flex min-w-0 items-start gap-2.5 rounded-chat-tile p-2.5 transition-colors hover:bg-chat-card/70 focus-visible:outline-2 focus-visible:outline-chat-ink"
    :class="[props.active && 'bg-chat-card shadow-chat-lift hover:bg-chat-card', props.size === 'md' && 'gap-3 rounded-chat-tile-lg p-3']"
    :aria-current="props.active ? 'page' : undefined"
  >
    <ChatAgentAvatar
      :kind="look.kind"
      :icon="look.icon"
      :tone="look.tone"
      :size="props.size === 'md' ? 'md' : 'sm'"
      :state="working ? 'working' : 'idle'"
    />
    <div class="min-w-0 flex-1">
      <p class="truncate font-medium text-chat-ink" :class="props.size === 'md' ? 'text-[15px]' : 'text-[13.5px]'">{{ props.conversation.title }}</p>
      <p class="mt-px flex items-center gap-[5px] text-[12.5px]" :class="working ? 'font-medium text-chat-accent' : 'text-chat-ink-3'">
        <UIcon v-if="working && props.conversation.activity" :name="activityIcon(props.conversation.activity)" class="size-3.5 shrink-0" />
        <span class="min-w-0 flex-1 truncate">{{ line }}</span>
        <span class="shrink-0 ps-2 text-[11.5px] font-normal text-chat-ink-3 tabular-nums">{{ when }}</span>
      </p>
    </div>
  </NuxtLink>
</template>
