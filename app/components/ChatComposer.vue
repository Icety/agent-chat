<script setup lang="ts">
import type { ComposerInput } from '../utils/chats'

// The one message composer: text (Enter sends, Shift Enter for a new line), attachments and
// voice notes. Used by every chat thread, and by a host's own "ask" box on a start screen.
// On a phone it is one pill row (attach, text, mic, send); on a desktop a card with a tool row.
const props = withDefaults(defineProps<{
  /** Whose draft this is (a conversation id, or e.g. 'ask'); unsent text and files survive unmounts. */
  draftKey: string
  placeholder: string
  send: (input: ComposerInput) => Promise<void>
  /** 'card': lifted card under a thread. 'inset': grey field inside a card. */
  surface?: 'card' | 'inset'
  /** Show "Enter to send" on desktop. */
  hint?: boolean
  /** Hide the attach button on a phone. */
  compact?: boolean
}>(), { surface: 'card', hint: false, compact: false })

const { text, files, sending, draft } = useComposerDraft(() => props.draftKey)
const online = useOnline()
const fileInput = ref<HTMLInputElement | null>(null)
const prompt = ref<{ textareaRef: HTMLTextAreaElement | null } | null>(null)
const recorder = useRecorder()
const toast = useToast()

const canSend = computed(() => online.value && (text.value.trim() !== '' || files.value.length > 0))

// Only what was sent is cleared: text typed or files added while sending stay in the draft.
const submit = async (voice?: Blob) => {
  if (sending.value || !online.value) return
  if (!voice && !canSend.value) return
  const sentDraft = draft.value
  const sentText = sentDraft.text
  const sentFiles = [...sentDraft.files]
  sentDraft.sending = true
  try {
    await props.send({ text: sentText, files: sentFiles, voice })
    if (sentDraft.text === sentText) sentDraft.text = ''
    sentDraft.files = sentDraft.files.filter(f => !sentFiles.includes(f))
  }
  catch (err) {
    toast.add({ title: 'Message not sent', description: String(err), color: 'error' })
  }
  finally {
    sentDraft.sending = false
  }
}

const pickFiles = (event: Event) => {
  const target = event.target as HTMLInputElement
  files.value = [...files.value, ...Array.from(target.files ?? [])]
  target.value = ''
}
const removeFile = (index: number) => { files.value = files.value.filter((_, i) => i !== index) }

const toggleRecording = async () => {
  if (!recorder.recording.value) {
    try {
      await recorder.start()
    }
    catch (err) {
      const blocked = err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError')
      toast.add(blocked
        ? { title: 'Microphone access is blocked. Allow it in your browser settings.', color: 'warning', icon: 'i-lucide-mic-off' }
        : { title: 'Microphone not available', description: String(err), color: 'error' })
    }
    return
  }
  const blob = await recorder.stop()
  if (blob) await submit(blob)
}

// iOS pans the whole page up for the keyboard and does not always pan it back.
const onKeyboardClose = () => { setTimeout(() => window.scrollTo(0, 0), 50) }

const focus = () => prompt.value?.textareaRef?.focus()
defineExpose({ focus })

const surfaceClass = computed(() => props.surface === 'card' ? 'bg-chat-card shadow-chat-lift-hi' : 'bg-chat-inset')
const duration = computed(() => {
  const s = recorder.seconds.value
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
})
const tool = 'size-11 shrink-0 justify-center lg:size-8'
</script>

<template>
  <div class="flex flex-col gap-2">
    <div v-if="files.length" class="flex flex-wrap gap-1.5 px-1">
      <button
        v-for="(f, i) in files"
        :key="`${f.name}-${i}`"
        type="button"
        class="inline-flex h-8 max-w-60 items-center gap-1.5 rounded-full bg-chat-card ps-3 pe-2 text-[13px] text-chat-ink-2 shadow-chat-lift hover:text-chat-ink"
        :aria-label="`Remove ${f.name}`"
        @click="removeFile(i)"
      >
        <UIcon name="i-lucide-paperclip" class="size-3.5 shrink-0 text-chat-ink-3" />
        <span class="truncate">{{ f.name }}</span>
        <UIcon name="i-lucide-x" class="size-3.5 shrink-0" />
      </button>
    </div>

    <input ref="fileInput" type="file" multiple class="hidden" @change="pickFiles">

    <div
      v-if="recorder.recording.value"
      class="flex min-h-14 items-center gap-3 rounded-chat-sheet p-1.5 ps-5 lg:rounded-[22px]"
      :class="surfaceClass"
      aria-live="polite"
    >
      <span class="size-2.5 shrink-0 rounded-full bg-chat-err motion-safe:animate-chat-pulse" />
      <span class="flex-1 text-[15px] tabular-nums">Recording {{ duration }}</span>
      <UButton color="neutral" variant="ghost" label="Cancel" class="min-h-11" @click="recorder.cancel()" />
      <UButton color="neutral" icon="i-lucide-arrow-up" aria-label="Send voice note" class="size-11 justify-center" @click="toggleRecording" />
    </div>

    <UChatPrompt
      v-else
      ref="prompt"
      v-model="text"
      :autofocus="false"
      :placeholder="online ? props.placeholder : 'Offline'"
      variant="naked"
      :maxrows="8"
      :disabled="!online"
      :class="[
        'flex-row items-end gap-0.5 rounded-chat-sheet p-1.5 backdrop-blur-none',
        'lg:flex-col lg:items-stretch lg:gap-2.5 lg:rounded-[22px] lg:pt-3.5 lg:pe-2.5 lg:pb-2.5 lg:ps-[18px]',
        surfaceClass,
      ]"
      :ui="{
        header: 'lg:hidden',
        body: 'min-w-0 flex-1 self-center lg:self-stretch',
        base: 'px-1 py-2 text-[15px] leading-6 text-chat-ink placeholder:truncate placeholder:text-chat-ink-3 lg:p-0',
        footer: 'gap-0.5 lg:gap-1.5',
      }"
      @submit="submit()"
      @focusout="onKeyboardClose"
    >
      <template v-if="!props.compact" #header>
        <UButton icon="i-lucide-plus" color="neutral" variant="ghost" aria-label="Attach files" :class="tool" :disabled="!online" @click="fileInput?.click()" />
      </template>
      <template #footer>
        <UButton icon="i-lucide-paperclip" color="neutral" variant="outline" aria-label="Attach files" :class="tool" class="max-lg:hidden" :disabled="!online" @click="fileInput?.click()" />
        <UButton v-if="online" icon="i-lucide-mic" color="neutral" variant="ghost" aria-label="Record a voice note" :class="tool" class="lg:ring lg:ring-chat-line-strong" @click="toggleRecording" />
        <span class="hidden flex-1 lg:block" />
        <span v-if="props.hint" class="me-1.5 hidden text-xs text-chat-ink-3 xl:inline">Enter to send · Shift Enter for a new line</span>
        <span
          v-if="!online"
          class="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-chat-inset px-3.5 text-[13px] font-medium text-chat-ink-3 lg:h-10 dark:bg-chat-raised"
          role="status"
        >
          <UIcon name="i-lucide-cloud-off" class="size-4" />Back online to send
        </span>
        <UButton
          v-else
          icon="i-lucide-arrow-up"
          color="neutral"
          aria-label="Send"
          class="size-11 shrink-0 justify-center lg:size-10"
          :loading="sending"
          @click="submit()"
        />
      </template>
    </UChatPrompt>
  </div>
</template>
