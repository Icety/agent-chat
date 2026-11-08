# agent-chat

Chat with Claude Code agents from a web app (or an installed PWA). Every conversation runs as a
`claude` session in tmux on the server; messages reach it through a Claude Code channel (an MCP
server) and replies come back through that channel's reply tool.

Extracted from Koopa (`Icety/koopa`, `layers/core`) so Koopa, Toadette and Moonies can share it.
Nothing in here knows about a specific app, person or server: names, links, auth, paths and the
database come from the host app.

## The seam

What moved into this package, and what stays in each host app.

| In the package | Stays in the host |
| --- | --- |
| Tables `agents`, `conversations`, `messages`, `push_subscriptions` (SQLite and Postgres) | Login, password, sessions (`nuxt-auth-utils`, Better Auth, ...) |
| Chat service: messages to the agent, system notes, retry, long-poll inbox, ack, replies, hook events, notify, main conversation per agent, supervision (always-on agents, idle side chats) | The global auth middleware (the package routes also check auth themselves) |
| Sessions: tmux + `claude` + channel registration + hook settings | PWA, service worker, icons, app head |
| Live events: bus, SSE stream (`/api/events`), live topics for features | Health check, deploy, CLI commands (`koopa deploy`, projects) |
| Files (uploads, files the agent sends), voice note transcription (whisper.cpp), Claude login check | Start screen, home summaries, nav badges, shell (rail, tab bar, search) |
| Web push to subscribed devices | Settings page, agent management screens |
| Attention: chats whose messages did not arrive, chats at work | How agents look (orb, builder, project accents): registered with `registerAgentLook` |
| Channel MCP server and hook script (`channel/`) | Design tokens (mapped onto `--chat-*`, see Styling) |
| UI: `ChatPanel`, `ChatComposer`, `MessageContent`, `VoiceNote`, `ChatRow`, `ConversationList`, `ChatThread`, `ChatDetails`, `ChatAgentAvatar`, `ChatActivityReceipt`, `ChatLoginHelp` | Pages and routes: the host decides where a chat lives (`/c/:id` in Koopa) |
| Extension points: `registerChatTimeline` (cards between messages), `registerAgentLook`, `useLiveTopic` / `publishChatTopic` | Env var names (`NUXT_KOOPA_*`): the host maps its own config onto the package |

## Layout

```
shared/    types and rules used on both sides (wire types, topics, delivery, preview, working)
lib/       plain TypeScript: services and the storage port (no Nuxt)
  storage/sqlite  bun:sqlite adapter, sync repos, migrations (byte-identical to Koopa's)
  storage/pg      Postgres adapter (drizzle pg-core), migrations
channel/   the Claude Code channel (MCP server) and the hook script
server/    Nuxt layer: API routes, host registration, supervision plugin
app/       Nuxt layer: composables, components, styles
playground/ a minimal host used for typecheck and build
```

## Host integration

### 1. Install and extend

```jsonc
// package.json
"dependencies": { "@icety/agent-chat": "github:Icety/agent-chat#v0.1.0" }
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  extends: ['@icety/agent-chat'],
  modules: ['@nuxt/ui'],
  nitro: { preset: 'bun' }, // the services use Bun APIs (Bun.spawn, Bun.write, bun:sqlite)
})
```

```css
/* main.css: let Tailwind see the package's classes and pull in its styles */
@import "tailwindcss";
@import "@nuxt/ui";
@import "@icety/agent-chat/app/assets/chat.css";
@source "../../node_modules/@icety/agent-chat";
```

### 2. Register the host (server)

One call, before the first request, usually from a Nitro plugin or the host's own boot util.

```ts
// server/plugins/agent-chat.ts
import { openSqliteChatDb, createSqliteChatStore } from '@icety/agent-chat/lib/storage/sqlite'
import { agentChatDir } from '@icety/agent-chat/lib/runtime'

export default defineNitroPlugin(() => {
  // Bundling moves the package code, so pass the migrations folder on disk.
  const db = openSqliteChatDb('/data/app.db', agentChatDir('lib', 'storage', 'sqlite', 'migrations'))
  // Postgres instead: createPgChatStore(drizzle(postgres(url)))
  setAgentChatHost({
    store: createSqliteChatStore(db),
    dataDir: '/data',                                     // files/ and internal.token live here
    appName: 'MyApp',                                     // shown to the agent and in pushes
    ownerName: 'Alex',                                    // "not typed by Alex" on system notes
    timeZone: 'Europe/Amsterdam',
    links: { conversation: id => `/c/${id}` },
    requireOwner: async event => { await requireUserSession(event) },
    sessions: {
      claudeBin: 'claude', tmuxBin: 'tmux', tmuxSocket: '',
      channelServer: 'myapp-web',                         // MCP server name inside claude
      publicUrl: 'http://127.0.0.1:3100',                 // how the channel reaches the app
      envPrefix: 'MYAPP',                                 // also sets MYAPP_CONVERSATION, MYAPP_URL, MYAPP_TOKEN_FILE
    },
    idleHours: 6,
    push: { vapidPublicKey, vapidPrivateKey, vapidSubject: 'mailto:you@example.com' }, // optional
    transcribe: { whisperBin, model, lang: 'nl' },        // optional
    defaultAgent: { name: 'Assistant', cwd: '/home/app/assistant', alwaysOn: true },  // optional seed
  })
})
```

`MailHost`-style integrations (another package that needs the chat) use `useAgentChat()`:
`chat.sendSystemNote(conversationId, text)`, `chat.notify({ text, agentId? })`,
`store.conversations.get(id)`, `store.agents.list()`, `store.messages.hasSystemNote(id, text)`,
and `publishChatTopic(topic, data)` for live topics.

### 3. Client config

```ts
// app/app.config.ts
export default defineAppConfig({
  agentChat: {
    appName: 'MyApp',
    timeZone: 'Europe/Amsterdam',
    conversationPath: '/c/',      // ChatRow links to `${conversationPath}${id}`
    chatsPath: '/chats',          // where ChatThread goes after archiving
    settingsPath: '/settings',    // where the "Claude is not logged in" banner links
    claudeLogin: 'ssh -t root@server sudo -iu app claude',
  },
})
```

### 4. Pages

The package ships components, not pages. A host page is a few lines:

```vue
<!-- app/pages/c/[id].vue -->
<script setup lang="ts">
const route = useRoute()
</script>
<template><ChatThread :conversation-id="String(route.params.id)" /></template>
```

### 5. Extension points

- `registerChatTimeline('mail', conversationId => computed(() => items))` from a client plugin:
  cards between the messages of a chat.
- `registerAgentLook('projects', agentId => ({ kind, icon, tone, label, hint }))`: how an agent
  shows up. Without one: its name and a chat icon.
- Override any component by name: a host component `ChatAgentAvatar.vue` replaces the package's.
- Live topics: `publishChatTopic('gym.plan', { planId })` on the server, `useLiveTopic('gym.plan', fn)`
  on the client. Add topic types with module augmentation of `@icety/agent-chat/shared/topics`.

### Styling

Components use `chat-*` colors (`text-chat-ink-3`, `bg-chat-card`, ...). They fall back to Nuxt
UI's own variables, so a plain Nuxt UI app looks right. A host with its own design system maps them:

```css
:root { --chat-ink: var(--k-ink); --chat-card: var(--k-card); --chat-bubble: var(--k-bubble); }
```

Full list: `app/assets/chat.css`.

## Routes

Owner routes call `host.requireOwner(event)`. Internal routes need the internal token
(`Authorization: Bearer`, from `<dataDir>/internal.token` or `host.internalToken`) and a loopback
peer.

| Route | What |
| --- | --- |
| `GET /api/agents`, `POST /api/agents`, `PATCH /api/agents/:id` | Agents |
| `GET /api/conversations?archived=1`, `POST /api/conversations`, `PATCH /api/conversations/:id` | Conversations (list has a one-line preview) |
| `GET/POST /api/conversations/:id/messages` | Messages; POST is multipart (`text`, `files`, `voice`) |
| `POST /api/conversations/:id/messages/:messageId/retry`, `POST /api/conversations/:id/stop` | Retry a message, stop the session |
| `GET /api/events` | Server-sent events: messages, delivery, activity, conversations, topics |
| `GET /api/files/:id` | An attachment |
| `GET /api/status` | Claude version and login, running sessions, push and voice availability |
| `GET /api/chat/attention` | Undelivered messages and chats at work (for a home screen) |
| `POST /api/push/subscribe`, `/unsubscribe`, `/test` | Web push |
| `GET /api/internal/inbox`, `POST /api/internal/ack`, `/reply`, `/hook`, `/notify` | Channel, hook and scripts |

## The channel

`channel/server.ts` is the MCP server `claude` runs for every session. Its environment comes from
the tmux session the package starts:

| Env | What |
| --- | --- |
| `AGENT_CHAT_CONVERSATION` | The conversation this session belongs to |
| `AGENT_CHAT_URL` | The app (host `sessions.publicUrl`) |
| `AGENT_CHAT_TOKEN_FILE` | The internal token file |
| `AGENT_CHAT_APP_NAME` | "the MyApp app" in the instructions |
| `AGENT_CHAT_SERVER_NAME` | The channel's MCP name (`myapp-web`) |
| `AGENT_CHAT_INSTRUCTIONS_FILE` | Optional extra instructions appended to the channel's own |

With `sessions.envPrefix` set, the same three values are also exported as `<PREFIX>_CONVERSATION`,
`<PREFIX>_URL` and `<PREFIX>_TOKEN_FILE`, for the host's own agent tools.

## Data

SQLite: `openSqliteChatDb(path)` migrates with drizzle's default `__drizzle_migrations` table, so
Koopa's existing database is recognised as up to date. The migrations are byte-identical to
Koopa's `layers/core/server/db/migrations`; never edit them, add new ones with
`bun run db:generate:sqlite`.

Postgres: `createPgChatStore(db)` takes any drizzle Postgres database (postgres-js, PGlite, ...).
Hosts with their own drizzle-kit setup re-export `@icety/agent-chat/lib/storage/pg/schema` from
their schema index and generate migrations themselves; others run drizzle's `migrate(db, {
migrationsFolder: agentChatDir('lib', 'storage', 'pg', 'migrations') })`. The tables live in their own
Postgres schema, `agent_chat`, so they never collide with a host's own `messages` table.

## Checks

```bash
bun install
bun run prepare:playground   # once: generates the playground's types
bun test              # services, both storage adapters (Postgres via PGlite), channel
bun run typecheck     # the playground host with the layer, then lib/, channel/, shared/
bun run build         # the playground host
bun run dev           # try it: http://localhost:3000. Sending a message starts a real claude
                      # session in tmux, in the agent's folder, and registers the channel there
```
