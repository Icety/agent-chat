<script setup lang="ts">
import type { PublicAttachment } from '../../shared/types'
import { isWorking } from '../../shared/working'

// The context of one chat: which assistant, where it works, how its session lives, and the
// files and images that came by in this chat.
const props = defineProps<{ conversationId: string }>()
const emit = defineEmits<{ close: [] }>()

const { agents, conversations, messages } = useChat()
const { lookOf, mainOf } = useAgents()
const { now, format } = useChatTime()

const conversation = computed(() => conversations.value.find(c => c.id === props.conversationId))
const agent = computed(() => agents.value.find(a => a.id === conversation.value?.agentId))
const look = computed(() => lookOf(agent.value?.id))
const folder = computed(() => agent.value?.cwd.replace(/^\/home\/[^/]+/, '~') ?? '')
const session = computed(() => agent.value?.alwaysOn && agent.value && mainOf(agent.value.id)?.id === props.conversationId ? 'Always on' : 'Stops when idle')

const KIND: Record<PublicAttachment['kind'], { icon: string, label: string }> = {
  image: { icon: 'i-lucide-image', label: 'Image' },
  audio: { icon: 'i-lucide-audio-lines', label: 'Voice note' },
  file: { icon: 'i-lucide-file', label: 'File' },
}
const files = computed(() => (messages.value[props.conversationId] ?? [])
  .flatMap(m => m.attachments.map(a => ({ ...a, at: m.createdAt })))
  .reverse()
  .slice(0, 12))
const size = (bytes: number) => bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`
</script>

<template>
  <div class="flex flex-col gap-4 p-5">
    <div class="flex items-center gap-2">
      <h2 class="flex-1 text-[15px] font-semibold">Details</h2>
      <UButton icon="i-lucide-x" color="neutral" variant="outline" aria-label="Close details" class="relative size-8 justify-center after:absolute after:-inset-1.5" @click="emit('close')" />
    </div>

    <section class="rounded-chat-card bg-chat-card p-[18px] shadow-chat-lift">
      <div class="mb-3 flex items-center gap-3">
        <ChatAgentAvatar :kind="look.kind" :icon="look.icon" :tone="look.tone" :state="conversation && isWorking(conversation, now) ? 'working' : 'idle'" />
        <div class="min-w-0">
          <p class="truncate text-[15px] font-semibold">{{ look.label }}</p>
          <p class="truncate text-xs text-chat-ink-3">{{ look.hint }}</p>
        </div>
      </div>
      <dl class="divide-y divide-chat-line text-[13px]">
        <div class="flex justify-between gap-3 py-[7px]">
          <dt class="text-chat-ink-3">Folder</dt>
          <dd class="min-w-0 truncate font-mono text-[12.5px]" :title="agent?.cwd">{{ folder }}</dd>
        </div>
        <div class="flex justify-between gap-3 py-[7px]">
          <dt class="text-chat-ink-3">Session</dt>
          <dd>{{ session }}</dd>
        </div>
        <div v-if="conversation" class="flex justify-between gap-3 py-[7px]">
          <dt class="text-chat-ink-3">Created</dt>
          <dd class="tabular-nums">{{ format(conversation.createdAt, 'relative') }}</dd>
        </div>
      </dl>
    </section>

    <section class="rounded-chat-card bg-chat-card p-[18px] shadow-chat-lift">
      <h3 class="mb-2 text-[15px] font-semibold">In this chat</h3>
      <p v-if="files.length === 0" class="text-[13px] text-chat-ink-3">No files or images yet.</p>
      <a
        v-for="f in files"
        :key="f.id"
        :href="f.url"
        target="_blank"
        rel="noopener"
        class="flex items-center gap-3 border-chat-line py-2.5 not-first-of-type:border-t"
      >
        <ChatFileTile :icon="KIND[f.kind].icon" size="xs" />
        <span class="min-w-0">
          <span class="block truncate text-[13px] font-medium">{{ f.name }}</span>
          <span class="block text-xs text-chat-ink-3">{{ KIND[f.kind].label }} · {{ size(f.size) }}</span>
        </span>
      </a>
    </section>
  </div>
</template>
