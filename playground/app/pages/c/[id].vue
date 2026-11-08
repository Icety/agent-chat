<script setup lang="ts">
const route = useRoute()
</script>

<template>
  <ChatThread :conversation-id="String(route.params.id)" />
</template>
