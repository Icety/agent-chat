<script setup lang="ts">
import { isWorking } from '../../shared/working'

// One chat. Desktop: the chat list, the thread and (wide screens) its details. Phone: the
// thread alone. A host page renders this: <ChatThread :conversation-id="id" />.
// `list: false` leaves out the chat list column (a host that shows its own).
const props = withDefaults(defineProps<{ conversationId: string, list?: boolean }>(), { list: true })

const router = useRouter()
const id = computed(() => props.conversationId)
const { conversations, updateConversation } = useChat()
const { lookOf, startChat } = useAgents()
const chatsPath = useAppConfig().agentChat.chatsPath

const conversation = computed(() => conversations.value.find(c => c.id === id.value))
const { now } = useChatTime()
const working = computed(() => conversation.value ? isWorking(conversation.value, now.value) : false)
const look = computed(() => lookOf(conversation.value?.agentId))
const title = computed(() => {
  const t = conversation.value?.title
  if (!t) return 'Chat'
  return t === 'Main' ? look.value.label : t
})
const subtitle = computed(() => `${look.value.label} · ${look.value.hint}`)

const renameOpen = ref(false)
const renameValue = ref('')
const openRename = () => {
  renameValue.value = conversation.value?.title ?? ''
  renameOpen.value = true
}
const rename = async () => {
  const value = renameValue.value.trim()
  if (value) await updateConversation(id.value, { title: value })
  renameOpen.value = false
}

const archive = async () => {
  await updateConversation(id.value, { archived: true })
  await navigateTo(chatsPath)
}

// Details: a column next to the thread on wide screens, a slideover elsewhere.
const wide = ref(false)
const detailsOpen = ref(false)
let query: MediaQueryList | undefined
const onWide = () => {
  wide.value = Boolean(query?.matches)
  detailsOpen.value = wide.value
}
onMounted(() => {
  query = window.matchMedia('(min-width: 1440px)')
  onWide()
  query.addEventListener('change', onWide)
})
onBeforeUnmount(() => query?.removeEventListener('change', onWide))
const slideoverOpen = computed({
  get: () => detailsOpen.value && !wide.value,
  set: (value: boolean) => { detailsOpen.value = value },
})

const newChat = () => startChat(conversation.value?.agentId)
const menu = computed(() => [[
  { label: `New chat with ${look.value.label}`, icon: 'i-lucide-square-pen', onSelect: () => { void newChat() } },
  { label: 'Details', icon: 'i-lucide-panel-right', onSelect: () => { detailsOpen.value = true } },
  { label: 'Rename', icon: 'i-lucide-pencil', onSelect: openRename },
], [
  { label: 'Archive', icon: 'i-lucide-archive', onSelect: archive },
]])

const back = () => {
  if (window.history.state?.back) router.back()
  else void navigateTo(chatsPath)
}
</script>

<template>
  <div class="flex min-h-0 flex-1">
    <aside v-if="props.list" class="hidden w-[300px] shrink-0 border-r border-chat-line lg:block">
      <ConversationList />
    </aside>

    <section class="flex min-w-0 flex-1 flex-col" aria-label="Conversation">
      <header class="flex shrink-0 items-center gap-2 border-b border-chat-line ps-2.5 pe-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 lg:h-16 lg:gap-3 lg:px-7 lg:py-0">
        <UButton icon="i-lucide-chevron-left" color="neutral" variant="ghost" aria-label="Back" class="size-11 justify-center lg:hidden" :ui="{ leadingIcon: 'size-[22px]' }" @click="back" />
        <ChatAgentAvatar :kind="look.kind" :icon="look.icon" :tone="look.tone" :state="working ? 'working' : 'idle'" />
        <div class="min-w-0 flex-1 ps-1 lg:ps-0">
          <p class="truncate text-[15px] font-semibold">{{ title }}</p>
          <p class="truncate text-xs" :class="working ? 'font-medium text-chat-accent lg:font-normal lg:text-chat-ink-3' : 'text-chat-ink-3'">
            <span class="lg:hidden">{{ working ? conversation?.activity : look.label }}</span>
            <span class="hidden lg:inline">{{ subtitle }}</span>
          </p>
        </div>
        <span v-if="working" class="hidden h-[22px] items-center gap-[5px] rounded-chat-badge bg-chat-accent-tint px-2 text-xs font-medium text-chat-accent lg:inline-flex">
          <ChatLiveDot pulse class="!size-1.5 !shadow-none" />Working
        </span>
        <UButton icon="i-lucide-square-pen" color="neutral" variant="outline" :aria-label="`New chat with ${look.label}`" class="size-11 justify-center lg:hidden" @click="newChat" />
        <UButton
          icon="i-lucide-panel-right"
          color="neutral"
          variant="outline"
          aria-label="Show details"
          class="hidden size-8 justify-center lg:inline-flex"
          :class="detailsOpen && 'bg-chat-inset'"
          @click="detailsOpen = !detailsOpen"
        />
        <UDropdownMenu :items="menu" :content="{ align: 'end' }">
          <UButton icon="i-lucide-ellipsis" color="neutral" variant="outline" aria-label="Chat menu" class="size-11 justify-center lg:size-8" />
        </UDropdownMenu>
      </header>

      <ChatPanel :conversation-id="id" />
    </section>

    <aside v-if="wide && detailsOpen" class="w-[320px] shrink-0 overflow-y-auto border-l border-chat-line">
      <ChatDetails :conversation-id="id" @close="detailsOpen = false" />
    </aside>
    <USlideover v-model:open="slideoverOpen" title="Details" :ui="{ content: 'bg-chat-ground max-w-sm' }">
      <template #content>
        <div class="overflow-y-auto pt-[env(safe-area-inset-top)]">
          <ChatDetails :conversation-id="id" @close="detailsOpen = false" />
        </div>
      </template>
    </USlideover>

    <UModal v-model:open="renameOpen" title="Rename chat">
      <template #body>
        <form class="flex gap-2" @submit.prevent="rename">
          <UInput v-model="renameValue" autofocus class="flex-1" aria-label="Chat name" />
          <UButton type="submit" color="neutral" label="Save" />
        </form>
      </template>
    </UModal>
  </div>
</template>
