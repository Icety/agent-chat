<script setup lang="ts">
// Claude is not logged in on the server: messages wait until it is.
defineProps<{ compact?: boolean }>()
const command = useAppConfig().agentChat.claudeLogin
</script>

<template>
  <UAlert
    color="warning"
    variant="subtle"
    icon="i-lucide-key-round"
    title="Claude is not logged in on the server"
    :description="compact ? 'Your messages wait until it is. See Settings for how to log in.' : undefined"
  >
    <template v-if="!compact" #description>
      <template v-if="command">
        <p>Your messages wait until it is. To log in, run:</p>
        <pre class="my-2 rounded bg-elevated p-2 text-xs">{{ command }}</pre>
        <p>Then type <code>/login</code>, log in with your Claude account in the browser, and type <code>/exit</code>.</p>
      </template>
      <p v-else>Your messages wait until it is. Run <code>claude</code> on the server as the app's user, type <code>/login</code>, log in in the browser, and type <code>/exit</code>.</p>
    </template>
  </UAlert>
</template>
