<script setup lang="ts">
// A small status dot with a soft halo: live, or off (neutral).
const props = withDefaults(defineProps<{
  tone?: 'live' | 'neutral'
  pulse?: boolean
}>(), { tone: 'live', pulse: false })
</script>

<template>
  <span
    class="inline-block size-2 shrink-0 rounded-full"
    :class="[props.tone === 'live' ? 'bg-chat-live shadow-[0_0_0_3px_var(--color-chat-accent-tint)]' : 'bg-chat-ink-4', { 'motion-safe:animate-chat-pulse': props.pulse }]"
    aria-hidden="true"
  />
</template>
