import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

// Claude sessions live in tmux sessions on the server owned by tmux.service, never in
// this app's process tree: restarting or redeploying the app must not kill them.
export type Exec = (args: string[], opts?: { cwd?: string }) => Promise<{ code: number, stdout: string, stderr: string }>

export interface SessionsConfig {
  tmuxBin: string
  tmuxSocket: string
  claudeBin: string
  channelServer: string
  channelCommand: string[]
  publicUrl: string
  tokenFile: string
  hookCommand: string
  // Named in the channel's system prompt: "the person using the <appName> app".
  appName: string
  // Also export the conversation, URL and token file as <PREFIX>_CONVERSATION, ... for the host's
  // own agent tools (e.g. 'KOOPA'). Empty: only the AGENT_CHAT_* names.
  envPrefix?: string
  // Optional extra channel instructions (a file the channel appends to its own).
  instructionsFile?: string
  exec: Exec
  sleep?: (ms: number) => Promise<void>
  // Whether claude has a transcript for this session; --resume without one exits at once.
  transcriptExists?: (cwd: string, sessionId: string) => boolean
}

export interface StartOptions {
  conversationId: string
  cwd: string
  resumeSessionId?: string | null
  extraArgs?: string[]
  settings?: Record<string, unknown>
}

export interface Sessions {
  start: (opts: StartOptions) => Promise<void>
  isRunning: (conversationId: string) => Promise<boolean>
  listRunning: () => Promise<string[]>
  stop: (conversationId: string) => Promise<void>
}

const PREFIX = 'c-'

// Claude keeps transcripts in ~/.claude/projects/<cwd with / and . as ->/<session>.jsonl
export const transcriptPath = (projectsDir: string, cwd: string, sessionId: string): string =>
  join(projectsDir, cwd.replace(/[/.]/g, '-'), `${sessionId}.jsonl`)

const defaultTranscriptExists = (cwd: string, sessionId: string): boolean =>
  existsSync(transcriptPath(join(homedir(), '.claude', 'projects'), cwd, sessionId))

export const sessionName = (conversationId: string): string => `${PREFIX}${conversationId}`

// Prompts claude can show at start, with the keys that accept them. The trust prompt
// defaults to "No, exit", so it needs Down first.
const STARTUP_PROMPTS: { match: RegExp, keys: string[] }[] = [
  { match: /one you trust|trust this folder/i, keys: ['Down', 'Enter'] },
  { match: /Bypass Permissions mode/i, keys: ['Down', 'Enter'] },
  { match: /development channels/i, keys: ['Enter'] },
  // Offer to switch renderer; our prompt detection reads the default TUI.
  { match: /fullscreen renderer/i, keys: ['Down', 'Enter'] },
]

const READY = /^\s*❯\s*$/m

export const channelSystemPrompt = (server: string, appName: string): string =>
  `Messages that arrive through the ${server} channel come from the person using the ${appName} app. `
  + `They cannot see this terminal. Always answer them with the mcp__${server}__reply tool, never only in the terminal.`

// Hooks report what the session is doing (session id, tool use, done) to the app.
export const hookSettings = (command: string, extra: Record<string, unknown> = {}): string => {
  const hook = [{ hooks: [{ type: 'command', command, timeout: 5 }] }]
  return JSON.stringify({
    ...extra,
    hooks: {
      SessionStart: hook,
      PreToolUse: [{ matcher: '*', hooks: hook[0]?.hooks }],
      Stop: hook,
    },
  })
}

// What the channel, the hook and the agent's own tools read from the session's environment.
export const sessionEnv = (config: Pick<SessionsConfig, 'publicUrl' | 'tokenFile' | 'appName' | 'channelServer' | 'envPrefix' | 'instructionsFile'>, conversationId: string): string[] => {
  const shared = { CONVERSATION: conversationId, URL: config.publicUrl, TOKEN_FILE: config.tokenFile }
  const prefix = config.envPrefix?.replace(/[^A-Z0-9_]/gi, '').toUpperCase()
  return [
    ...Object.entries(shared).map(([key, value]) => `AGENT_CHAT_${key}=${value}`),
    `AGENT_CHAT_APP_NAME=${config.appName}`,
    `AGENT_CHAT_SERVER_NAME=${config.channelServer}`,
    ...(config.instructionsFile ? [`AGENT_CHAT_INSTRUCTIONS_FILE=${config.instructionsFile}`] : []),
    ...(prefix ? Object.entries(shared).map(([key, value]) => `${prefix}_${key}=${value}`) : []),
  ]
}

export const createSessions = (config: SessionsConfig): Sessions => {
  const sleep = config.sleep ?? (ms => new Promise(r => setTimeout(r, ms)))
  const socketArgs = config.tmuxSocket ? ['-L', config.tmuxSocket] : []
  const tmux = (...args: string[]) => config.exec([config.tmuxBin, ...socketArgs, ...args])
  const registered = new Set<string>()
  const transcriptExists = config.transcriptExists ?? defaultTranscriptExists

  const isRunning = async (conversationId: string): Promise<boolean> =>
    (await tmux('has-session', '-t', `=${sessionName(conversationId)}`)).code === 0

  // The channel must be a configured MCP server (not --mcp-config) for claude to treat it
  // as a channel. Local scope keeps it to this folder and out of the folder's git repo.
  const ensureChannelServer = async (cwd: string): Promise<void> => {
    if (registered.has(cwd)) return
    const existing = await config.exec([config.claudeBin, 'mcp', 'get', config.channelServer], { cwd })
    if (existing.code !== 0) {
      const added = await config.exec(
        [config.claudeBin, 'mcp', 'add', '-s', 'local', config.channelServer, '--', ...config.channelCommand],
        { cwd },
      )
      if (added.code !== 0) throw new Error(`claude mcp add failed in ${cwd}: ${added.stderr.trim()}`)
    }
    registered.add(cwd)
  }

  const answerStartupPrompts = async (name: string): Promise<void> => {
    for (let i = 0; i < 30; i++) {
      await sleep(1000)
      const pane = await tmux('capture-pane', '-p', '-t', `=${name}:`)
      if (pane.code !== 0) return
      const prompt = STARTUP_PROMPTS.find(p => p.match.test(pane.stdout))
      if (prompt) {
        await tmux('send-keys', '-t', `=${name}:`, ...prompt.keys)
        continue
      }
      if (READY.test(pane.stdout)) return
    }
  }

  const starting = new Map<string, Promise<void>>()

  const start = (opts: StartOptions): Promise<void> => {
    const inFlight = starting.get(opts.conversationId)
    if (inFlight) return inFlight
    const run = startOnce(opts).finally(() => { starting.delete(opts.conversationId) })
    starting.set(opts.conversationId, run)
    return run
  }

  const startOnce = async (opts: StartOptions): Promise<void> => {
    const name = sessionName(opts.conversationId)
    if (await isRunning(opts.conversationId)) return
    await ensureChannelServer(opts.cwd)
    const claudeArgs = [
      config.claudeBin,
      '--dangerously-skip-permissions',
      '--dangerously-load-development-channels', `server:${config.channelServer}`,
      '--append-system-prompt', channelSystemPrompt(config.channelServer, config.appName),
      ...(config.hookCommand
        ? ['--settings', hookSettings(config.hookCommand, opts.settings)]
        : opts.settings ? ['--settings', JSON.stringify(opts.settings)] : []),
      ...(opts.resumeSessionId && transcriptExists(opts.cwd, opts.resumeSessionId) ? ['--resume', opts.resumeSessionId] : []),
      ...(opts.extraArgs ?? []),
    ]
    const result = await tmux(
      'new-session', '-d', '-s', name, '-x', '200', '-y', '50', '-c', opts.cwd,
      ...sessionEnv(config, opts.conversationId).flatMap(entry => ['-e', entry]),
      '--', ...claudeArgs,
    )
    if (result.code !== 0) {
      throw new Error(`tmux new-session failed for ${name}: ${result.stderr.trim()}`)
    }
    await answerStartupPrompts(name)
  }

  const listRunning = async (): Promise<string[]> => {
    const result = await tmux('list-sessions', '-F', '#{session_name}')
    if (result.code !== 0) return []
    return result.stdout.split('\n')
      .map(s => s.trim())
      .filter(s => s.startsWith(PREFIX))
      .map(s => s.slice(PREFIX.length))
  }

  const stop = async (conversationId: string): Promise<void> => {
    await tmux('kill-session', '-t', `=${sessionName(conversationId)}`)
  }

  return { start, isRunning, listRunning, stop }
}

export const bunExec: Exec = async (args, opts) => {
  const proc = Bun.spawn(args, { stdout: 'pipe', stderr: 'pipe', cwd: opts?.cwd })
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  return { code, stdout, stderr }
}
