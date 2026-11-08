<script setup lang="ts">
import type { ChatMessage, Status } from '../../shared/types'
import { ChatActivityReceipt } from '#components'
import type { ActivityRun } from '../utils/activity'
import { isWorking } from '../../shared/working'
import { isUndelivered } from '../../shared/delivery'
import { mergeTimeline, type ChatTimelineItem } from '../utils/timeline'
import type { ComposerInput } from '../utils/chats'

// The messages and composer of one conversation. Used by the chat page and by feature screens
// (a workspace's chat pane), so there is only one chat to keep working.
const props = defineProps<{ conversationId: string }>()

const { conversations, messages, loadMessages, send, retry: retryMessage, agentName, activityRuns } = useChat()
const { now, format } = useChatTime()
const { lookOf } = useAgents()
const settingsPath = useAppConfig().agentChat.settingsPath
const toast = useToast()

const conversation = computed(() => conversations.value.find(c => c.id === props.conversationId))
const look = computed(() => lookOf(conversation.value?.agentId))
const { data: status } = useFetch<Status>('/api/status', { server: false })
const list = computed<ChatMessage[]>(() => messages.value[props.conversationId] ?? [])

// What this device saw the agent do: finished runs sit in the timeline, the open one at the bottom.
const runs = computed<ActivityRun[]>(() => activityRuns.value[props.conversationId] ?? [])
const openRun = computed(() => {
  const last = runs.value.at(-1)
  return last && !last.endedAt && working.value ? last : undefined
})
const receipts = computed<ChatTimelineItem[]>(() => runs.value
  .filter(run => run.endedAt)
  .map(run => ({ id: run.observedSince, at: run.observedSince, component: ChatActivityReceipt, props: { steps: run.steps, state: 'done' } })))

// Features' cards (registerChatTimeline) between the messages.
const timelineItems = useChatTimeline(toRef(props, 'conversationId'))
const timeline = computed(() => mergeTimeline(list.value, { ...timelineItems.value, activity: receipts.value }))

// A day label above the first entry of each Amsterdam day.
const dayOf = (iso: string) => format(iso, 'day')
const dayLabel = (iso: string) => {
  const now = Date.now()
  const day = dayOf(iso)
  if (day === dayOf(new Date(now).toISOString())) return 'Today'
  if (day === dayOf(new Date(now - 86_400_000).toISOString())) return 'Yesterday'
  return day
}
const rows = computed(() => timeline.value.map((entry, i) => {
  const prev = timeline.value[i - 1]
  return { entry, day: !prev || dayOf(prev.at) !== dayOf(entry.at) ? dayLabel(entry.at) : undefined }
}))

watch(() => props.conversationId, value => { void loadMessages(value) }, { immediate: true })

// Typing dots only while the agent has the owner's message and has not answered yet (or reports
// activity). Never for a message still on its way, and app notes do not count.
// Both follow the shared isWorking rule, so a chat left with an old activity or an unanswered
// message from hours ago does not look busy.
const working = computed(() => conversation.value ? isWorking(conversation.value, now.value) : false)
const waiting = computed(() => {
  const c = conversation.value
  if (!c) return false
  if (working.value) return true
  const last = list.value.filter(m => m.origin !== 'system').at(-1)
  return last?.role === 'user' && last.status === 'delivered' && isWorking({ activity: 'waiting', lastActivityAt: c.lastActivityAt }, now.value)
})

// "Not delivered" (shared/delivery.ts): failed, or still pending 10 minutes after sending or the last Retry.
const notDelivered = (m: ChatMessage): boolean => isUndelivered(m, now.value)

// Keep the newest message in view: after opening a chat, after sending, and when a reply comes
// in, unless the owner scrolled up to read. Only this list scrolls, never the page, so the header
// and the composer stay put when the phone keyboard opens or closes.
const scroller = ref<HTMLElement | null>(null)
const nearBottom = ref(true)
const onScroll = () => {
  const el = scroller.value
  if (el) nearBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 120
}
const scrollToBottom = () => nextTick(() => {
  const el = scroller.value
  if (el) el.scrollTop = el.scrollHeight
})
watch(() => [props.conversationId, timeline.value.length, waiting.value, openRun.value?.steps.length] as const, (now, before) => {
  if (now[0] !== before?.[0]) nearBottom.value = true
  if (nearBottom.value || list.value.at(-1)?.role === 'user') void scrollToBottom()
}, { immediate: true })
// Images load after the text, and the keyboard shrinks the view: both push the newest message out of sight.
const keepBottom = () => { if (nearBottom.value) void scrollToBottom() }
onMounted(() => window.visualViewport?.addEventListener('resize', keepBottom))
onBeforeUnmount(() => window.visualViewport?.removeEventListener('resize', keepBottom))

const submit = async (input: ComposerInput) => {
  await send(props.conversationId, input)
  nearBottom.value = true
}

// The same message back to the agent's inbox; the state clears once it is delivered.
const retrying = ref<string | null>(null)
const retry = async (message: ChatMessage) => {
  retrying.value = message.id
  try {
    await retryMessage(props.conversationId, message.id)
  }
  catch (err) {
    toast.add({ title: 'Could not retry', description: String(err), color: 'error' })
  }
  finally {
    retrying.value = null
  }
}

// One line on a phone: long agent names ("Booking widget (sample)") drop out of the placeholder.
const PLACEHOLDER_NAME_MAX = 12
const placeholder = computed(() => look.value.label.length <= PLACEHOLDER_NAME_MAX ? `Message ${look.value.label}` : 'Message')

const time = (iso: string) => format(iso, 'time')
const name = computed(() => conversation.value ? agentName(conversation.value.agentId) : 'your assistant')
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div
      ref="scroller"
      class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-3 [mask-image:linear-gradient(to_bottom,transparent,#000_28px)] lg:px-7"
      @scroll.passive="onScroll"
    >
      <div class="mx-auto flex w-full max-w-[760px] flex-col gap-[18px] lg:gap-[22px]" @load.capture="keepBottom">
        <template v-if="status?.claudeLoggedIn === false">
          <NuxtLink v-if="settingsPath" :to="settingsPath" class="block">
            <ChatLoginHelp compact />
          </NuxtLink>
          <ChatLoginHelp v-else compact />
        </template>

        <template v-for="{ entry: e, day } in rows" :key="e.id">
          <span v-if="day" class="self-center rounded-full bg-chat-inset px-2.5 py-1 text-xs font-medium text-chat-ink-3 dark:bg-chat-raised">{{ day }}</span>

          <component :is="e.item.component" v-if="e.kind === 'item'" v-bind="e.item.props" />

          <MessageContent v-else-if="e.message.origin === 'system'" :message="e.message" />

          <div v-else-if="e.message.role === 'user'" class="ms-auto flex max-w-[86%] flex-col items-end gap-1.5 lg:max-w-[78%]">
            <MessageContent :message="e.message" />
            <p v-if="notDelivered(e.message)" class="flex items-center gap-2 text-xs font-medium text-chat-err">
              <UIcon name="i-lucide-circle-alert" class="size-3.5" />
              Not delivered · {{ time(e.message.createdAt) }}
              <UButton
                label="Retry"
                size="xs"
                color="neutral"
                variant="outline"
                class="min-h-8 px-3 max-lg:relative max-lg:after:absolute max-lg:after:-inset-1.5"
                :loading="retrying === e.message.id"
                @click="retry(e.message)"
              />
            </p>
            <p v-else class="flex items-center gap-1 text-[11.5px] text-chat-ink-3 tabular-nums">
              {{ time(e.message.createdAt) }}
              <UIcon v-if="e.message.status === 'pending'" name="i-lucide-clock" class="size-3.5" aria-label="Waiting to be delivered" />
              <UIcon v-else name="i-lucide-check-check" class="size-3.5" aria-label="Delivered" />
            </p>
          </div>

          <div v-else class="flex min-w-0 items-start gap-3">
            <ChatAgentAvatar :kind="look.kind" :icon="look.icon" :tone="look.tone" size="sm" class="mt-0.5" />
            <div class="flex min-w-0 flex-1 flex-col gap-1.5">
              <p class="hidden items-center gap-2 text-[13px] font-semibold lg:flex">
                {{ look.label }}
                <span class="text-xs font-normal text-chat-ink-3 tabular-nums">{{ time(e.message.createdAt) }}</span>
              </p>
              <MessageContent :message="e.message" />
              <p class="text-[11.5px] text-chat-ink-3 tabular-nums lg:hidden">{{ time(e.message.createdAt) }}</p>
            </div>
          </div>
        </template>

        <ChatActivityReceipt v-if="openRun" :steps="openRun.steps" state="working" :observed-since="openRun.observedSince" />
        <div v-else-if="waiting" class="flex items-center gap-3" aria-label="Working">
          <ChatAgentAvatar :kind="look.kind" :icon="look.icon" :tone="look.tone" size="sm" state="working" />
          <span class="flex gap-1 rounded-full bg-chat-card px-3.5 py-3 shadow-chat-lift">
            <span v-for="i in 3" :key="i" class="size-1.5 animate-bounce rounded-full bg-chat-ink-4" :style="{ animationDelay: `${i * 150}ms` }" />
          </span>
        </div>

        <p v-if="timeline.length === 0" class="mt-10 text-center text-sm text-chat-ink-3">
          Say hi to {{ name }}.
        </p>
      </div>
    </div>

    <footer class="relative shrink-0 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:px-7 lg:pb-6">
      <div class="mx-auto w-full max-w-[760px]">
        <slot name="above-composer" />
        <ChatComposer :draft-key="props.conversationId" :placeholder="placeholder" :send="submit" hint />
      </div>
    </footer>
  </div>
</template>
