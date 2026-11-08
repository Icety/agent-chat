<script setup lang="ts">
// The icon of an attachment in a message or the chat details.
const props = withDefaults(defineProps<{ icon: string, size?: 'xs' | 'sm' }>(), { size: 'sm' })
</script>

<template>
  <span
    class="inline-flex shrink-0 items-center justify-center bg-chat-inset text-chat-ink-2"
    :class="props.size === 'xs' ? 'size-7 rounded-[9px]' : 'size-9 rounded-chat-control'"
  >
    <UIcon :name="props.icon" :class="props.size === 'xs' ? 'size-3.5' : 'size-4'" />
  </span>
</template>
