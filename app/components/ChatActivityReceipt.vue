<script setup lang="ts">
import type { ActivityStep } from '../utils/activity'

// What an agent reported doing, as seen by this device. While working it shows the latest steps
// with the earlier ones folded; when done it collapses to one line that opens the full list.
const props = defineProps<{
  steps: ActivityStep[]
  state: 'working' | 'done'
  /** ISO time this device started watching; earlier activity is not shown. */
  observedSince?: string
}>()

const VISIBLE = 3
const SHOWN_WHEN_FOLDED = 2
const showEarlier = ref(false)
const open = ref(false)

const { format } = useChatTime()
const time = (iso: string) => format(iso, 'time')
const countLabel = computed(() => `${props.steps.length} ${props.steps.length === 1 ? 'update' : 'updates'}`)
const folded = computed(() => props.steps.length > VISIBLE && !showEarlier.value)
const hiddenCount = computed(() => props.steps.length - SHOWN_WHEN_FOLDED)
const visibleSteps = computed(() => folded.value ? props.steps.slice(-SHOWN_WHEN_FOLDED) : props.steps)
const range = computed(() => {
  const first = props.steps[0]
  const last = props.steps.at(-1)
  if (!first || !last) return ''
  return first.at === last.at ? time(first.at) : `${time(first.at)} to ${time(last.at)}`
})
const doneSummary = computed(() => {
  const n = props.steps.length
  return `${n} activity ${n === 1 ? 'update' : 'updates'} observed on this device${range.value ? ` · ${range.value}` : ''}`
})
</script>

<template>
  <section
    v-if="props.state === 'working'"
    class="flex flex-col gap-2.5 rounded-chat-panel bg-chat-card px-4 py-3.5 shadow-chat-lift"
    aria-live="polite"
  >
    <div class="flex items-center gap-2.5 text-[13px]">
      <span class="inline-flex items-center gap-2 font-semibold text-chat-accent">
        <ChatLiveDot pulse />
        Working
      </span>
      <span v-if="props.observedSince" class="min-w-0 truncate text-chat-ink-3">· observed since {{ time(props.observedSince) }}</span>
      <span class="ms-auto shrink-0 text-xs text-chat-ink-3">{{ countLabel }}</span>
    </div>

    <ol class="flex flex-col">
      <li v-if="folded">
        <button
          type="button"
          class="flex min-h-8 w-full items-center gap-2.5 text-[13px] text-chat-ink-3 hover:text-chat-ink"
          @click="showEarlier = true"
        >
          <UIcon name="i-lucide-chevrons-up-down" class="size-[15px]" />
          {{ hiddenCount }} earlier {{ hiddenCount === 1 ? 'update' : 'updates' }}
        </button>
      </li>
      <li
        v-for="(step, index) in visibleSteps"
        :key="`${step.at}-${index}`"
        class="flex min-h-7 items-center gap-2.5 text-[13px]"
        :class="index === visibleSteps.length - 1 ? 'font-medium text-chat-ink' : 'text-chat-ink-3'"
      >
        <UIcon
          :name="step.icon ?? 'i-lucide-circle-dot'"
          class="size-[15px] shrink-0"
          :class="{ 'text-chat-accent': index === visibleSteps.length - 1 }"
        />
        <span class="min-w-0 flex-1 truncate">{{ step.text }}</span>
        <time :datetime="step.at" class="shrink-0 text-[11.5px] tabular-nums">{{ time(step.at) }}</time>
      </li>
    </ol>

    <p class="flex items-start gap-1.5 border-t border-chat-line pt-2.5 text-[11.5px] text-chat-ink-3">
      <UIcon name="i-lucide-smartphone" class="mt-px size-3.5 shrink-0" />
      Activity observed on this device. Updates from before you opened the chat are not shown.
    </p>
  </section>

  <UCollapsible
    v-else
    v-model:open="open"
    class="rounded-chat-panel shadow-[inset_0_0_0_1px_var(--color-chat-line-strong)]"
  >
    <button type="button" class="flex min-h-11 w-full items-center gap-2.5 px-3.5 py-2.5 text-start text-[13px] text-chat-ink-3 hover:text-chat-ink">
      <UIcon name="i-lucide-activity" class="size-4 shrink-0" />
      <span class="min-w-0 flex-1 truncate">{{ doneSummary }}</span>
      <UIcon name="i-lucide-chevron-down" class="size-4 shrink-0 transition-transform" :class="{ 'rotate-180': open }" />
    </button>
    <template #content>
      <ol class="flex flex-col px-3.5 pb-3">
        <li v-for="(step, index) in props.steps" :key="`${step.at}-${index}`" class="flex min-h-7 items-center gap-2.5 text-[13px] text-chat-ink-3">
          <UIcon :name="step.icon ?? 'i-lucide-circle-dot'" class="size-[15px] shrink-0" />
          <span class="min-w-0 flex-1 truncate">{{ step.text }}</span>
          <time :datetime="step.at" class="shrink-0 text-[11.5px] tabular-nums">{{ time(step.at) }}</time>
        </li>
      </ol>
      <p class="flex items-center gap-1.5 border-t border-chat-line px-3.5 py-2.5 text-[11.5px] text-chat-ink-3">
        <UIcon name="i-lucide-smartphone" class="size-3.5 shrink-0" />
        Activity observed on this device
      </p>
    </template>
  </UCollapsible>
</template>
