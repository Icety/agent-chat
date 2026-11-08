<script setup lang="ts">
import type { PublicAttachment } from '../../shared/types'

// A voice note as a pill: play/pause, a waveform that fills as it plays, and the length.
// The waveform is decorative (the same shape every time for the same note).
const props = defineProps<{ attachment: PublicAttachment, mine: boolean }>()

const BARS = 22
const audio = ref<HTMLAudioElement | null>(null)
const playing = ref(false)
const current = ref(0)
const duration = ref(0)

const heights = computed(() => {
  let seed = [...props.attachment.id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7)
  return Array.from({ length: BARS }, () => {
    seed = (seed * 1103515245 + 12345) >>> 0
    return 6 + (seed % 17)
  })
})
const progress = computed(() => duration.value > 0 ? current.value / duration.value : 0)
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const label = computed(() => playing.value || current.value > 0 ? clock(current.value) : (duration.value > 0 ? clock(duration.value) : 'Voice'))

const onMeta = () => {
  const d = audio.value?.duration ?? 0
  duration.value = Number.isFinite(d) ? d : 0
}
const toggle = () => {
  const el = audio.value
  if (!el) return
  if (el.paused) void el.play()
  else el.pause()
}
</script>

<template>
  <div
    class="flex w-fit max-w-full items-center gap-2.5 rounded-full py-1.5 ps-1.5 pe-3.5"
    :class="props.mine ? 'bg-chat-bubble text-chat-on-bubble' : 'bg-chat-card text-chat-ink shadow-chat-lift'"
  >
    <button
      type="button"
      class="flex size-9 shrink-0 items-center justify-center rounded-full"
      :class="props.mine ? 'bg-chat-on-bubble text-chat-bubble' : 'bg-chat-action text-chat-on-action'"
      :aria-label="playing ? 'Pause voice note' : 'Play voice note'"
      @click="toggle"
    >
      <UIcon :name="playing ? 'i-lucide-pause' : 'i-lucide-play'" class="size-3.5" />
    </button>
    <span class="flex h-[22px] items-center gap-0.5" aria-hidden="true">
      <i
        v-for="(h, i) in heights"
        :key="i"
        class="block w-[3px] rounded-[2px] bg-current"
        :class="(current === 0 && !playing) || i / BARS < progress ? 'opacity-90' : 'opacity-35'"
        :style="{ height: `${h}px` }"
      />
    </span>
    <span class="text-xs tabular-nums">{{ label }}</span>
    <audio
      ref="audio"
      :src="props.attachment.url"
      preload="metadata"
      class="hidden"
      @loadedmetadata="onMeta"
      @durationchange="onMeta"
      @timeupdate="current = audio?.currentTime ?? 0"
      @play="playing = true"
      @pause="playing = false"
      @ended="playing = false; current = 0"
    />
  </div>
</template>
