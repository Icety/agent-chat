import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import webpush from 'web-push'
import type { ChatStore } from './ports'
import { createBus, type Bus, type ChatEvent } from './bus'
import { createInbox } from './inbox'
import { bunExec, createSessions, type Exec, type Sessions } from './sessions'
import { createChat, type Chat } from './chat'
import { createFiles, type Files } from './files'
import { createTranscriber } from './transcribe'
import { createPusher, type PushPayload, type SendFn } from './push'
import { checkClaudeAuth } from './claude-auth'
import { systemNotePrefix } from './serialize'

// Everything a host decides. The package never reads env vars itself: hosts map their own config
// (NUXT_KOOPA_*, NUXT_TOADETTE_*, ...) onto this.
export interface AgentChatConfig {
  store: ChatStore
  // Uploads (files/) and the internal token file live here.
  dataDir: string
  // Fixed internal token; empty: generated once in <dataDir>/internal.token.
  internalToken?: string
  // "the Koopa app", push titles.
  appName: string
  // "[MyApp app note, not typed by Alex]" on system notes the agent receives.
  ownerName: string
  // IANA zone for times the server writes into titles ("New chat 7 Nov, 14:02"). Default UTC.
  timeZone?: string
  // Where a push opens a conversation. Default: /c/<id>.
  conversationUrl?: (conversationId: string) => string
  sessions: {
    // The MCP server name inside claude, e.g. 'koopa-web'.
    channelServer: string
    // How the channel and hooks reach the app, e.g. http://127.0.0.1:3100.
    publicUrl: string
    claudeBin?: string
    tmuxBin?: string
    tmuxSocket?: string
    // Default: bun <package>/channel/server.ts
    channelCommand?: string[]
    // Default: bun <package>/channel/hook.ts
    hookCommand?: string
    envPrefix?: string
    instructionsFile?: string
  }
  // Side chats stop after this many hours without activity. Default 6.
  idleHours?: number
  push?: { vapidPublicKey: string, vapidPrivateKey: string, vapidSubject: string } | { send: SendFn }
  transcribe?: { whisperBin: string, model: string, lang: string }
  // Seeded once when there are no agents yet and the folder exists.
  defaultAgent?: { name: string, cwd: string, alwaysOn?: boolean }
  exec?: Exec
}

export interface AgentChat {
  config: AgentChatConfig
  store: ChatStore
  bus: Bus<ChatEvent>
  sessions: Sessions
  chat: Chat
  files: Files
  transcribe: (path: string) => Promise<string | null>
  push: (payload: PushPayload) => Promise<void>
  pushEnabled: boolean
  voiceEnabled: boolean
  internalToken: string
  tokenFile: string
  notePrefix: string
  claudeAuth: () => Promise<{ loggedIn: boolean | null, method: string | null }>
  claudeVersion: () => Promise<string | null>
}

const isPackage = (dir: string): boolean => {
  try { return (JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { name?: string }).name === '@icety/agent-chat' }
  catch { return false }
}

// The package folder, for files that run outside the bundle (the channel, the hook, migrations).
// Bundling moves this file, so look from the working directory up: the host's
// node_modules/@icety/agent-chat, or the package itself (its tests and playground).
export const agentChatDir = (...parts: string[]): string => {
  let dir = process.cwd()
  for (;;) {
    const installed = join(dir, 'node_modules', '@icety', 'agent-chat')
    if (existsSync(join(installed, 'channel'))) return join(installed, ...parts)
    if (isPackage(dir)) return join(dir, ...parts)
    const up = dirname(dir)
    if (up === dir) return join(fileURLToPath(new URL('..', import.meta.url)), ...parts)
    dir = up
  }
}

const ensureToken = (path: string): string => {
  if (!existsSync(path)) writeFileSync(path, crypto.randomUUID() + crypto.randomUUID(), { mode: 0o600 })
  chmodSync(path, 0o600)
  return readFileSync(path, 'utf8').trim()
}

export const createAgentChat = (config: AgentChatConfig): AgentChat => {
  const exec = config.exec ?? bunExec
  const dataDir = isAbsolute(config.dataDir) ? config.dataDir : resolve(process.cwd(), config.dataDir)
  mkdirSync(join(dataDir, 'files'), { recursive: true })
  const tokenFile = join(dataDir, 'internal.token')
  const internalToken = config.internalToken || ensureToken(tokenFile)

  const bus = createBus<ChatEvent>()
  const store = config.store
  const claudeBin = config.sessions.claudeBin || 'claude'

  const pushConfig = config.push
  const send: SendFn | undefined = !pushConfig
    ? undefined
    : 'send' in pushConfig
      ? pushConfig.send
      : pushConfig.vapidPublicKey && pushConfig.vapidPrivateKey
        ? (() => {
            webpush.setVapidDetails(pushConfig.vapidSubject, pushConfig.vapidPublicKey, pushConfig.vapidPrivateKey)
            return async (sub, payload) => {
              await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 3600 })
            }
          })()
        : undefined
  const push = send ? createPusher({ store, send }) : async () => {}

  const sessions = createSessions({
    tmuxBin: config.sessions.tmuxBin || 'tmux',
    tmuxSocket: config.sessions.tmuxSocket ?? '',
    claudeBin,
    channelServer: config.sessions.channelServer,
    channelCommand: config.sessions.channelCommand?.length ? config.sessions.channelCommand : ['bun', agentChatDir('channel', 'server.ts')],
    publicUrl: config.sessions.publicUrl,
    tokenFile,
    hookCommand: config.sessions.hookCommand || `bun ${agentChatDir('channel', 'hook.ts')}`,
    appName: config.appName,
    envPrefix: config.sessions.envPrefix,
    instructionsFile: config.sessions.instructionsFile,
    exec,
  })

  // Cache the login check briefly: supervise and every message ask for it.
  let authCache: { at: number, ok: boolean } | undefined
  const canStart = async (): Promise<boolean> => {
    if (authCache && Date.now() - authCache.at < 30_000) return authCache.ok
    const auth = await checkClaudeAuth(exec, claudeBin)
    authCache = { at: Date.now(), ok: auth.loggedIn !== false }
    return authCache.ok
  }

  const chat = createChat({
    store, sessions, inbox: createInbox(), bus, push, canStart,
    idleHours: Number(config.idleHours ?? 6),
    conversationUrl: config.conversationUrl ?? (id => `/c/${id}`),
    channelServer: config.sessions.channelServer,
  })

  const transcribe = config.transcribe
    ? createTranscriber({ whisperBin: config.transcribe.whisperBin, model: config.transcribe.model, lang: config.transcribe.lang, exec })
    : async () => null

  return {
    config, store, bus, sessions, chat, push, transcribe, internalToken, tokenFile,
    files: createFiles(join(dataDir, 'files')),
    pushEnabled: Boolean(send),
    voiceEnabled: Boolean(config.transcribe?.whisperBin && config.transcribe.model),
    notePrefix: systemNotePrefix(config),
    claudeAuth: () => checkClaudeAuth(exec, claudeBin),
    claudeVersion: async () => {
      const version = await exec([claudeBin, '--version']).catch(() => ({ code: 1, stdout: '', stderr: '' }))
      return version.code === 0 ? version.stdout.trim() : null
    },
  }
}

// Boot: seed the default agent once.
export const seedDefaultAgent = async (app: AgentChat): Promise<void> => {
  const seed = app.config.defaultAgent
  if (!seed?.cwd || !existsSync(seed.cwd)) return
  if ((await app.store.agents.list()).length > 0) return
  await app.store.agents.create({ name: seed.name, cwd: seed.cwd, alwaysOn: seed.alwaysOn ?? true })
  console.info(`[agent-chat] seeded agent ${seed.name} in ${seed.cwd}`)
}
