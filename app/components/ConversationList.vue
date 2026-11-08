<script setup lang="ts">
import { groupChats } from '../utils/chats'
import { isWorking } from '../../shared/working'

// Every chat, grouped: running now, each main assistant's recent chats, earlier ones, and other
// assistants folded away. 'pane': the desktop column next to a thread. 'page': the phone Chats
// screen with search, filters and cards.
// `tools: false` leaves out the pane's own search and New chat when the desktop top bar has them.
// `searchButton`: the pane shows a Search button that emits `search` (a host's own search); without
// it the pane has no search.
const props = withDefaults(defineProps<{ variant?: 'pane' | 'page', tools?: boolean, searchButton?: boolean, searchHint?: string }>(), { variant: 'pane', tools: true, searchButton: false, searchHint: '' })
const emit = defineEmits<{ search: [] }>()

const { agents, conversations } = useChat()
const { newChatItems, ordered, order, lookOf } = useAgents()
const settingsPath = useAppConfig().agentChat.settingsPath
const route = useRoute()

const query = ref('')
const filter = ref<string>('all')
const showOther = ref(false)
const SHOWN = 5
const expanded = ref<Record<string, boolean>>({})

const { now } = useChatTime()
const running = computed(() => conversations.value.filter(c => isWorking(c, now.value)).length)
const filters = computed(() => [
  { value: 'all', label: 'All' },
  ...(running.value ? [{ value: 'running', label: `Running · ${running.value}` }] : []),
  ...ordered.value.slice(0, 3).map(a => ({ value: a.id, label: lookOf(a.id).label })),
])

const visible = computed(() => {
  const q = query.value.trim().toLowerCase()
  return conversations.value.filter(c =>
    (!q || c.title.toLowerCase().includes(q))
    && (filter.value === 'all' || (filter.value === 'running' ? isWorking(c, now.value) : c.agentId === filter.value)))
})
const grouped = computed(() => groupChats(visible.value, order.value, now.value))
const first = computed(() => ordered.value[0])
const isPage = computed(() => props.variant === 'page')
// In an assistant's own group its name under every title says nothing new.
const agentGroup = (id: string) => id !== 'running' && id !== 'earlier'
</script>

<template>
  <div class="flex min-h-0 flex-col" :class="isPage ? 'gap-3' : 'h-full gap-1 px-3 pt-5 pb-4'">
    <header v-if="!isPage" class="flex items-center gap-2 px-2 pb-3">
      <h1 class="flex-1 font-chat-display text-[28px]">Chats</h1>
      <UDropdownMenu v-if="props.tools" :items="newChatItems" :content="{ align: 'end' }">
        <UButton icon="i-lucide-plus" color="neutral" aria-label="New chat" class="size-8 justify-center" />
      </UDropdownMenu>
    </header>

    <button
      v-if="!isPage && props.tools && props.searchButton"
      type="button"
      class="mx-1 mb-1.5 flex h-9 shrink-0 items-center gap-2.5 rounded-full bg-chat-inset ps-3.5 pe-2 text-[13px] text-chat-ink-3 hover:text-chat-ink-2 dark:bg-chat-raised"
      @click="emit('search')"
    >
      <UIcon name="i-lucide-search" class="size-4" />
      <span class="flex-1 text-start">Search</span>
      <kbd v-if="props.searchHint" class="rounded-chat-chip bg-chat-card px-1.5 py-0.5 font-mono text-[11px] dark:bg-chat-inset">{{ props.searchHint }}</kbd>
    </button>

    <template v-else-if="isPage">
      <UInput
        v-model="query"
        icon="i-lucide-search"
        placeholder="Search chats"
        size="xl"
        variant="none"
        aria-label="Search chats"
        :ui="{ root: 'w-full', base: 'h-11 rounded-full bg-chat-inset ps-11 text-[15px] dark:bg-chat-raised', leadingIcon: 'size-[18px] text-chat-ink-3' }"
      />
      <div class="-mx-4 overflow-x-auto px-4 [scrollbar-width:none]">
        <UTabs
          v-model="filter"
          :items="filters"
          variant="pill"
          :content="false"
          aria-label="Filter chats"
          :ui="{ root: 'w-max', list: 'w-max p-1', trigger: 'h-10 shrink-0 grow-0 px-3.5 text-[13px] font-medium whitespace-nowrap' }"
        />
      </div>
    </template>

    <nav class="min-h-0" :class="isPage ? 'flex flex-col gap-1 pt-1' : 'flex-1 overflow-y-auto [scrollbar-width:thin]'" aria-label="Chats">
      <section v-for="group in grouped.groups" :key="group.id">
        <p class="flex items-center gap-1.5 pt-3.5 pb-1.5 text-xs font-medium text-chat-ink-3" :class="isPage ? 'ps-1.5' : 'ps-2.5'">
          <ChatLiveDot v-if="group.running" pulse class="!size-1.5" />
          {{ group.label }}
        </p>
        <div :class="isPage && 'rounded-chat-card bg-chat-card p-1 shadow-chat-lift'">
          <ChatRow
            v-for="c in expanded[group.id] ? group.conversations : group.conversations.slice(0, SHOWN)"
            :key="c.id"
            :conversation="c"
            :active="!isPage && route.params.id === c.id"
            :size="isPage ? 'md' : 'sm'"
            :show-agent="!agentGroup(group.id)"
          />
          <button
            v-if="group.conversations.length > SHOWN"
            type="button"
            class="flex min-h-10 w-full items-center gap-1 px-3 text-[13px] font-medium text-chat-ink-3 hover:text-chat-ink"
            @click="expanded[group.id] = !expanded[group.id]"
          >
            <UIcon :name="expanded[group.id] ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="size-4" />
            {{ expanded[group.id] ? 'Show fewer' : `Show all ${group.conversations.length}` }}
          </button>
        </div>
      </section>

      <section v-if="grouped.other.length">
        <button
          type="button"
          class="mt-1.5 flex min-h-10 items-center gap-1.5 text-xs font-medium text-chat-ink-3 hover:text-chat-ink"
          :class="isPage ? 'ps-1.5' : 'ps-2.5'"
          :aria-expanded="showOther"
          @click="showOther = !showOther"
        >
          <UIcon :name="showOther ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-3.5" />
          Other assistants · {{ grouped.other.length }}
        </button>
        <div v-if="showOther" :class="isPage && 'rounded-chat-card bg-chat-card p-1 shadow-chat-lift'">
          <ChatRow v-for="c in grouped.other" :key="c.id" :conversation="c" :active="!isPage && route.params.id === c.id" :size="isPage ? 'md' : 'sm'" />
        </div>
      </section>

      <UEmpty
        v-if="agents.length === 0"
        variant="naked"
        icon="i-lucide-bot"
        title="No assistants yet"
        :description="settingsPath ? 'Add one in Settings to start chatting.' : 'Add an agent to start chatting.'"
        :actions="settingsPath ? [{ label: 'Open Settings', to: settingsPath, color: 'neutral' }] : undefined"
      />
      <UEmpty
        v-else-if="grouped.groups.length === 0 && !grouped.other.length"
        variant="naked"
        icon="i-lucide-messages-square"
        :title="query || filter !== 'all' ? 'No chats match' : 'No chats yet'"
        :description="query || filter !== 'all' ? 'Try another search or filter.' : `Start one with ${first ? lookOf(first.id).label : 'your assistant'}.`"
      />
    </nav>
  </div>
</template>
