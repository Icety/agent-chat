<script setup lang="ts">
import type { ChatMessage } from '../../shared/types'
import { renderMarkdown } from '../utils/markdown'

// What a message says: markdown text, images, voice notes with their transcript, and files.
// A system note (the app telling the agent something) is one quiet centred line.
// Time and delivery state are drawn by ChatPanel around this.
const props = defineProps<{ message: ChatMessage }>()

const { format } = useChatTime()
const mine = computed(() => props.message.role === 'user')
const html = computed(() => (props.message.text ? renderMarkdown(props.message.text) : ''))
const images = computed(() => props.message.attachments.filter(a => a.kind === 'image'))
const audio = computed(() => props.message.attachments.filter(a => a.kind === 'audio'))
const others = computed(() => props.message.attachments.filter(a => a.kind === 'file'))

// A system note shows its first line, at most its first sentence (or about 90 characters);
// everything else sits behind "Show details".
const NOTE_MAX = 90
const note = computed(() => {
  const text = props.message.text.trim()
  const [first = '', ...rest] = text.split('\n')
  const sentence = first.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? first
  const cut = sentence.length > NOTE_MAX ? `${sentence.slice(0, NOTE_MAX).replace(/\s+\S*$/, '')}…` : sentence
  return { summary: cut, more: cut.length < first.length || rest.some(l => l.trim()) }
})
const showNote = ref(false)

const sizeLabel = (bytes: number) => bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`
</script>

<template>
  <div v-if="message.origin === 'system'" class="mx-auto flex max-w-[85%] flex-col items-center gap-1 text-center text-xs text-chat-ink-3">
    <p class="flex items-start justify-center gap-1.5">
      <UIcon name="i-lucide-info" class="mt-px size-3.5 shrink-0" />
      <span>{{ note.summary }} <span class="text-chat-ink-4">· {{ format(message.createdAt, 'short') }}</span></span>
    </p>
    <button
      v-if="note.more"
      type="button"
      class="min-h-8 font-medium text-chat-ink-3 underline-offset-2 hover:text-chat-ink hover:underline"
      :aria-expanded="showNote"
      @click="showNote = !showNote"
    >
      {{ showNote ? 'Hide details' : 'Show details' }}
    </button>
    <p v-if="showNote" class="w-full rounded-chat-control bg-chat-inset px-3 py-2 text-start whitespace-pre-wrap text-chat-ink-2 dark:bg-chat-raised">{{ message.text }}</p>
  </div>
  <div v-else class="flex min-w-0 flex-col gap-2" :class="mine ? 'items-end' : 'items-start'">
    <div v-if="images.length || others.length" class="flex max-w-full flex-wrap items-end gap-2" :class="mine && 'justify-end'">
      <a v-for="img in images" :key="img.id" :href="img.url" target="_blank" rel="noopener" class="block overflow-hidden rounded-chat-tile shadow-chat-ring">
        <img :src="img.url" :alt="img.name" class="max-h-60 max-w-[min(100%,280px)] object-contain">
      </a>
      <a
        v-for="f in others"
        :key="f.id"
        :href="f.url"
        target="_blank"
        rel="noopener"
        class="flex max-w-full items-center gap-2.5 rounded-chat-tile bg-chat-card py-2 ps-2 pe-3 text-[13px] shadow-chat-lift hover:shadow-chat-lift-hi"
      >
        <ChatFileTile icon="i-lucide-file" />
        <span class="min-w-0">
          <span class="block truncate font-medium text-chat-ink">{{ f.name }}</span>
          <span class="block text-xs text-chat-ink-3">{{ sizeLabel(f.size) }}</span>
        </span>
      </a>
    </div>

    <template v-for="a in audio" :key="a.id">
      <VoiceNote :attachment="a" :mine="mine" />
      <p v-if="message.transcript" class="max-w-[340px] text-[13px]/[1.5] text-chat-ink-2" :class="mine && 'text-right'">
        "{{ message.transcript }}"
      </p>
    </template>


    <!-- eslint-disable-next-line vue/no-v-html -- sanitized with DOMPurify -->
    <div
      v-if="html"
      class="chat-md min-w-0 max-w-full break-words"
      :class="mine ? 'w-fit rounded-chat-card rounded-br-chat-chip bg-chat-bubble px-4 py-[11px] text-chat-on-bubble' : 'text-chat-ink'"
      v-html="html"
    />

  </div>
</template>
