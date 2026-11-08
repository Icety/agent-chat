<script setup lang="ts">
// Who is talking. A host with its own avatars (an orb, project accents) overrides this component
// by defining its own ChatAgentAvatar; it gets the agent's look (useAgents().lookOf).
const props = withDefaults(defineProps<{
  kind: string
  icon?: string
  tone?: string
  size?: 'sm' | 'md' | 'lg'
  state?: 'idle' | 'working' | 'offline'
}>(), { icon: undefined, tone: undefined, size: 'md', state: 'idle' })

const SIZE = { sm: 'size-8 [&>span]:size-4', md: 'size-10 [&>span]:size-5', lg: 'size-13 [&>span]:size-6' } as const
</script>

<template>
  <span
    class="relative inline-flex shrink-0 items-center justify-center rounded-full bg-chat-inset text-chat-ink-2"
    :class="[SIZE[props.size], props.state === 'working' && 'ring-2 ring-chat-accent ring-offset-2 ring-offset-(--color-chat-card)']"
    :data-kind="props.kind"
    :data-tone="props.tone"
  >
    <UIcon :name="props.icon ?? 'i-lucide-message-circle'" />
  </span>
</template>
