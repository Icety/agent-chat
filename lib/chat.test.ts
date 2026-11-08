import { describe, expect, test, beforeEach, jest } from 'bun:test'
import { sql } from 'drizzle-orm'
import { openSqliteChatDb, type ChatSqliteDb } from './storage/sqlite/client'
import { createSqliteChatStore } from './storage/sqlite/store'
import { addMessage, createAgent, createConversation, getConversation, listConversations, listMessages } from './storage/sqlite/repos'
import { createInbox } from './inbox'
import { createBus, type ChatEvent } from './bus'
import { createSessions, sessionName, transcriptPath, type Exec } from './sessions'
import { createChat } from './chat'
import { describeTool } from './activity'
import { busEventStream } from './events'
import { buildChatAttention } from './attention'
import { inboxMessage, publicMessage, systemNotePrefix, wireEvent } from './serialize'

const at = (iso: string): Date => new Date(iso)
const flush = () => new Promise(r => setTimeout(r, 0))

interface FakeTmux {
  exec: Exec
  calls: string[][]
  running: Set<string>
  panes: Map<string, string>
}

const fakeTmux = (): FakeTmux => {
  const calls: string[][] = []
  const running = new Set<string>()
  const panes = new Map<string, string>()
  const exec: Exec = async args => {
    calls.push(args)
    if (args.includes('mcp')) return { code: args.includes('get') ? 1 : 0, stdout: '', stderr: '' }
    const cmd = args.find(a => !a.startsWith('-') && !a.includes('/') && ['has-session', 'new-session', 'kill-session', 'list-sessions', 'capture-pane', 'send-keys'].includes(a))
    const target = (flag: string) => (args[args.indexOf(flag) + 1] ?? '')
    switch (cmd) {
      case 'has-session':
        return { code: running.has(target('-t').replace(/^=/, '')) ? 0 : 1, stdout: '', stderr: '' }
      case 'new-session':
        running.add(target('-s'))
        return { code: 0, stdout: '', stderr: '' }
      case 'kill-session':
        running.delete(target('-t').replace(/^=/, ''))
        return { code: 0, stdout: '', stderr: '' }
      case 'list-sessions':
        return { code: 0, stdout: [...running].join('\n'), stderr: '' }
      case 'capture-pane': {
        const t = target('-t')
        // tmux only accepts exact-match pane targets as =name: (with the colon)
        if (!t.endsWith(':')) return { code: 1, stdout: '', stderr: "can't find pane" }
        return { code: 0, stdout: panes.get(t.replace(/^=/, '').replace(/:$/, '')) ?? '', stderr: '' }
      }
      default:
        return { code: 0, stdout: '', stderr: '' }
    }
  }
  return { exec, calls, running, panes }
}

const sessionConfig = {
  tmuxBin: 'tmux',
  tmuxSocket: '',
  claudeBin: '/usr/local/bin/claude',
  channelServer: 'app-web',
  channelCommand: ['bun', '/opt/app/current/plugin/server.ts'],
  publicUrl: 'http://127.0.0.1:3000',
  tokenFile: '/home/agent/.config/app/internal.token',
  hookCommand: 'bun /opt/app/current/bin/app-hook',
  appName: 'Assistant',
  envPrefix: 'APP',
}

describe('sessions', () => {
  test('starts claude in tmux with the channel plugin and conversation env', async () => {
    const tmux = fakeTmux()
    const sessions = createSessions({ ...sessionConfig, exec: tmux.exec, sleep: async () => {} })
    await sessions.start({ conversationId: 'abc', cwd: '/home/agent/work' })

    const call = tmux.calls.find(c => c.includes('new-session'))
    expect(call).toBeDefined()
    expect(call).toContain('-c')
    expect(call).toContain('/home/agent/work')
    expect(call).toContain('AGENT_CHAT_CONVERSATION=abc')
    expect(call).toContain(`AGENT_CHAT_TOKEN_FILE=${sessionConfig.tokenFile}`)
    expect(call).toContain('AGENT_CHAT_SERVER_NAME=app-web')
    // The host's own agent tools (mail scripts, a CLI) read the prefixed names.
    expect(call).toContain('APP_CONVERSATION=abc')
    expect(call).toContain(`APP_URL=${sessionConfig.publicUrl}`)
    expect(call).toContain(`APP_TOKEN_FILE=${sessionConfig.tokenFile}`)
    expect(call).toContain('--dangerously-load-development-channels')
    expect(call).toContain('server:app-web')
    expect(call).toContain('--append-system-prompt')
    expect(call).not.toContain('--resume')
    expect(tmux.running.has(sessionName('abc'))).toBe(true)
  })

  test('registers the channel server for the folder once, before starting', async () => {
    const tmux = fakeTmux()
    const sessions = createSessions({ ...sessionConfig, exec: tmux.exec, sleep: async () => {} })
    await sessions.start({ conversationId: 'abc', cwd: '/home/agent/work' })
    const add = tmux.calls.find(c => c.includes('add'))
    expect(add).toEqual([
      sessionConfig.claudeBin, 'mcp', 'add', '-s', 'local', 'app-web', '--', 'bun', '/opt/app/current/plugin/server.ts',
    ])
    expect(tmux.calls.findIndex(c => c.includes('add'))).toBeLessThan(tmux.calls.findIndex(c => c.includes('new-session')))
  })

  test('passes hooks for session id, tool use and stop through --settings', async () => {
    const tmux = fakeTmux()
    const sessions = createSessions({ ...sessionConfig, exec: tmux.exec, sleep: async () => {} })
    await sessions.start({ conversationId: 'abc', cwd: '/tmp' })
    const call = tmux.calls.find(c => c.includes('new-session')) ?? []
    const settings = JSON.parse(call[call.indexOf('--settings') + 1] ?? '{}')
    expect(Object.keys(settings.hooks)).toEqual(['SessionStart', 'PreToolUse', 'Stop'])
    expect(settings.hooks.PreToolUse[0].hooks[0].command).toBe('bun /opt/app/current/bin/app-hook')
  })

  test('appends per-agent extra arguments, e.g. the Telegram channel during the switch', async () => {
    const tmux = fakeTmux()
    const sessions = createSessions({ ...sessionConfig, exec: tmux.exec, sleep: async () => {} })
    await sessions.start({ conversationId: 'abc', cwd: '/tmp', extraArgs: ['--channels', 'plugin:telegram@claude-plugins-official'] })
    const call = tmux.calls.find(c => c.includes('new-session')) ?? []
    expect(call.slice(-2)).toEqual(['--channels', 'plugin:telegram@claude-plugins-official'])
  })

  test('does not resume a session that has no transcript (claude would exit at once)', async () => {
    const tmux = fakeTmux()
    const sessions = createSessions({ ...sessionConfig, exec: tmux.exec, sleep: async () => {}, transcriptExists: () => false })
    await sessions.start({ conversationId: 'abc', cwd: '/tmp', resumeSessionId: 'sess-9' })
    const call = tmux.calls.find(c => c.includes('new-session')) ?? []
    expect(call).not.toContain('--resume')
  })

  test('transcript path follows claude\'s project folder naming', () => {
    expect(transcriptPath('/home/agent/.claude/projects', '/home/agent/work', 'sess-1'))
      .toBe('/home/agent/.claude/projects/-home-agent-work/sess-1.jsonl')
    expect(transcriptPath('/p', '/home/x/Work/site.nl', 's')).toBe('/p/-home-x-Work-site-nl/s.jsonl')
  })

  test('merges per-agent settings into the session settings next to the hooks', async () => {
    const tmux = fakeTmux()
    const sessions = createSessions({ ...sessionConfig, exec: tmux.exec, sleep: async () => {} })
    await sessions.start({ conversationId: 'abc', cwd: '/tmp', settings: { enabledPlugins: { 'telegram@claude-plugins-official': true } } })
    const call = tmux.calls.find(c => c.includes('new-session')) ?? []
    const settings = JSON.parse(call[call.indexOf('--settings') + 1] ?? '{}')
    expect(settings.enabledPlugins).toEqual({ 'telegram@claude-plugins-official': true })
    expect(Object.keys(settings.hooks)).toEqual(['SessionStart', 'PreToolUse', 'Stop'])
  })

  test('resumes an existing claude session id', async () => {
    const tmux = fakeTmux()
    const sessions = createSessions({ ...sessionConfig, exec: tmux.exec, sleep: async () => {}, transcriptExists: () => true })
    await sessions.start({ conversationId: 'abc', cwd: '/tmp', resumeSessionId: 'sess-9' })
    const call = tmux.calls.find(c => c.includes('new-session')) ?? []
    expect(call[call.indexOf('--resume') + 1]).toBe('sess-9')
  })

  test('answers the startup prompts: trust needs Down first (default is No), channels just Enter', async () => {
    const tmux = fakeTmux()
    let ticks = 0
    const sessions = createSessions({
      ...sessionConfig,
      exec: tmux.exec,
      sleep: async () => {
        ticks++
        if (ticks === 1) tmux.panes.set(sessionName('abc'), 'Quick safety check: Is this a project you created or one you trust?\n❯ No, exit\n  Yes, I trust this folder')
        if (ticks === 2) tmux.panes.set(sessionName('abc'), 'WARNING: Loading development channels\n❯ 1. I am using this for local development\n  2. Exit')
        if (ticks === 3) tmux.panes.set(sessionName('abc'), '❯ ')
      },
    })
    await sessions.start({ conversationId: 'abc', cwd: '/tmp' })
    const keys = tmux.calls.filter(c => c.includes('send-keys')).map(c => c.slice(c.indexOf('send-keys') + 3))
    expect(keys).toEqual([['Down', 'Enter'], ['Enter']])
  })

  test('declines the fullscreen renderer offer (option 2, "Not now")', async () => {
    const tmux = fakeTmux()
    let ticks = 0
    const sessions = createSessions({
      ...sessionConfig,
      exec: tmux.exec,
      sleep: async () => {
        ticks++
        if (ticks === 1) tmux.panes.set(sessionName('abc'), 'Try the new fullscreen renderer?\n❯ 1. Yes, try it\n  2. Not now')
        if (ticks === 2) tmux.panes.set(sessionName('abc'), '❯ ')
      },
    })
    await sessions.start({ conversationId: 'abc', cwd: '/tmp' })
    const keys = tmux.calls.filter(c => c.includes('send-keys')).map(c => c.slice(c.indexOf('send-keys') + 3))
    expect(keys).toEqual([['Down', 'Enter']])
  })

  test('isRunning, listRunning and stop', async () => {
    const tmux = fakeTmux()
    const sessions = createSessions({ ...sessionConfig, exec: tmux.exec, sleep: async () => {} })
    await sessions.start({ conversationId: 'one', cwd: '/tmp' })
    tmux.running.add('unrelated')
    expect(await sessions.isRunning('one')).toBe(true)
    expect(await sessions.listRunning()).toEqual(['one'])
    await sessions.stop('one')
    expect(await sessions.isRunning('one')).toBe(false)
  })
})

describe('inbox', () => {
  test('wait resolves early when notified, otherwise after the timeout', async () => {
    const inbox = createInbox()
    const early = inbox.wait('c1', 5000)
    inbox.notify('c1')
    expect(await early).toBe(true)
    expect(await inbox.wait('c1', 10)).toBe(false)
  })
})

describe('activity', () => {
  test('describes tool use in plain words', () => {
    expect(describeTool('Read', { file_path: '/home/agent/work/memory/notes.md' })).toBe('Reading notes.md')
    expect(describeTool('Edit', { file_path: '/a/b/USER.md' })).toBe('Editing USER.md')
    expect(describeTool('Bash', { command: 'python3 scripts/news-fetch.py --since yesterday --limit 50' })).toBe('Running python3 scripts/news-fetch.py --since ye…')
    expect(describeTool('WebSearch', { query: 'x' })).toBe('Searching the web')
    expect(describeTool('WebFetch', { url: 'https://www.ns.nl/reisplanner' })).toBe('Reading www.ns.nl')
    expect(describeTool('mcp__app-web__reply', {}, 'app-web')).toBeNull()
    expect(describeTool('mcp__brevo__send_email', {})).toBe('Using brevo')
  })
})

describe('chat', () => {
  let db: ChatSqliteDb
  let tmux: FakeTmux
  let events: ChatEvent[]
  let pushes: { title: string, body: string, url: string }[]
  let clock: Date

  let loggedIn = true
  const makeChat = () => {
    const bus = createBus<ChatEvent>()
    bus.subscribe(e => { events.push(e) })
    return createChat({
      canStart: async () => loggedIn,
      store: createSqliteChatStore(db),
      conversationUrl: id => `/c/${id}`,
      channelServer: 'app-web',
      sessions: createSessions({ ...sessionConfig, exec: tmux.exec, sleep: async () => {} }),
      inbox: createInbox(),
      bus,
      push: async payload => { pushes.push(payload) },
      idleHours: 6,
      now: () => clock,
    })
  }

  beforeEach(() => {
    db = openSqliteChatDb(':memory:')
    tmux = fakeTmux()
    events = []
    pushes = []
    clock = at('2026-10-07T10:00:00Z')
    loggedIn = true
  })

  test('no session is started while claude is not logged in; supervise starts it once it is', async () => {
    const chat = makeChat()
    const agent = createAgent(db, { name: 'Playground', cwd: '/tmp' })
    const conv = createConversation(db, { agentId: agent.id, title: 'x' })
    loggedIn = false
    await chat.sendUserMessage({ conversationId: conv.id, text: 'hallo?' })
    await flush()
    expect(tmux.calls.some(c => c.includes('new-session'))).toBe(false)

    loggedIn = true
    await chat.supervise()
    expect(tmux.running.has(sessionName(conv.id))).toBe(true)
  })

  test('a user message is stored as pending, starts the session and reaches the plugin', async () => {
    const chat = makeChat()
    const agent = createAgent(db, { name: 'Assistant', cwd: '/home/agent/work' })
    const conv = createConversation(db, { agentId: agent.id, title: 'Main' })

    await chat.sendUserMessage({ conversationId: conv.id, text: 'Hoi' })
    await flush()
    expect(tmux.running.has(sessionName(conv.id))).toBe(true)

    const batch = await chat.takePending(conv.id, 0)
    expect(batch.map(m => m.text)).toEqual(['Hoi'])
    await chat.ack(batch.map(m => m.id))
    expect(getConversation(db, conv.id)?.activity).toBe('Thinking')
    expect(await chat.takePending(conv.id, 0)).toEqual([])
    expect(events.some(e => e.type === 'message')).toBe(true)
    expect(events).toContainEqual({ type: 'delivered', conversationId: conv.id, messageIds: batch.map(m => m.id) })
  })

  test('the session is started once, even for two quick messages', async () => {
    const chat = makeChat()
    const agent = createAgent(db, { name: 'A', cwd: '/tmp' })
    const conv = createConversation(db, { agentId: agent.id, title: 'x' })
    await chat.sendUserMessage({ conversationId: conv.id, text: 'one' })
    await chat.sendUserMessage({ conversationId: conv.id, text: 'two' })
    await flush()
    await chat.sendUserMessage({ conversationId: conv.id, text: 'three' })
    await flush()
    expect(tmux.calls.filter(c => c.includes('new-session'))).toHaveLength(1)
  })

  test('a system note reaches the agent through the inbox like a message, marked as not from the owner', async () => {
    const chat = makeChat()
    const agent = createAgent(db, { name: 'Sales', cwd: '/tmp' })
    const conv = createConversation(db, { agentId: agent.id, title: 'Leads' })

    await chat.sendSystemNote(conv.id, 'Acme replied to your mail.')
    await flush()
    expect(tmux.running.has(sessionName(conv.id))).toBe(true)

    const [note] = await chat.takePending(conv.id, 0)
    expect(note && inboxMessage(note, systemNotePrefix({ appName: 'Assistant', ownerName: 'Alex' })).text).toBe('[Assistant app note, not typed by Alex] Acme replied to your mail.')
    expect(note && publicMessage(note).origin).toBe('system')
    await chat.ack(note ? [note.id] : [])
    expect(await chat.takePending(conv.id, 0)).toEqual([])
  })

  test('sending does not wait for the session to start', async () => {
    const chat = makeChat()
    const agent = createAgent(db, { name: 'A', cwd: '/tmp' })
    const conv = createConversation(db, { agentId: agent.id, title: 'x' })
    const message = await chat.sendUserMessage({ conversationId: conv.id, text: 'quick' })
    expect(message.status).toBe('pending')
    expect(tmux.calls.some(c => c.includes('new-session'))).toBe(false)
  })

  test('an assistant reply is stored, clears activity and sends a push', async () => {
    const chat = makeChat()
    const agent = createAgent(db, { name: 'Assistant', cwd: '/tmp' })
    const conv = createConversation(db, { agentId: agent.id, title: 'Main' })
    await chat.hook(conv.id, { hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: '/x/y.md' } })
    expect(getConversation(db, conv.id)?.activity).toBe('Reading y.md')

    await chat.assistantReply({ conversationId: conv.id, text: 'Done! Here is the plan.' })
    expect(listMessages(db, conv.id).at(-1)?.role).toBe('assistant')
    expect(getConversation(db, conv.id)?.activity).toBeNull()
    expect(pushes).toEqual([{ title: 'Assistant', body: 'Done! Here is the plan.', url: `/c/${conv.id}` }])
  })

  test('retry puts the same failed message back in the inbox, without a duplicate', async () => {
    const chat = makeChat()
    const agent = createAgent(db, { name: 'Builder', cwd: '/tmp' })
    const conv = createConversation(db, { agentId: agent.id, title: 'x' })
    const failed = addMessage(db, { conversationId: conv.id, role: 'user', text: 'bump the icon', status: 'failed' })

    expect((await chat.retryMessage(conv.id, failed.id)).status).toBe('pending')
    await flush()
    expect(tmux.running.has(sessionName(conv.id))).toBe(true)
    expect((await chat.takePending(conv.id, 0)).map(m => m.id)).toEqual([failed.id])
    expect(listMessages(db, conv.id)).toHaveLength(1)

    await chat.ack([failed.id])
    expect((await chat.retryMessage(conv.id, failed.id)).status).toBe('delivered')
    expect(await chat.takePending(conv.id, 0)).toEqual([])
  })

  test('retry and acknowledgement keep an old side session alive through supervision', async () => {
    const chat = makeChat()
    const agent = createAgent(db, { name: 'Helper', cwd: '/tmp' })
    const conv = createConversation(db, { agentId: agent.id, title: 'old' }, at('2026-10-01T00:00:00Z'))
    const failed = addMessage(db, { conversationId: conv.id, role: 'user', text: 'retry', status: 'failed' })
    await chat.retryMessage(conv.id, failed.id)
    await flush()
    expect(getConversation(db, conv.id)?.lastActivityAt).toEqual(clock)
    expect(events).toContainEqual({ type: 'conversation', conversation: getConversation(db, conv.id)! })
    await chat.supervise()
    expect(tmux.running.has(sessionName(conv.id))).toBe(true)

    clock = at('2026-10-07T17:00:00Z')
    await chat.ack([failed.id])
    expect(getConversation(db, conv.id)?.lastActivityAt).toEqual(clock)
    await chat.supervise()
    expect(tmux.running.has(sessionName(conv.id))).toBe(true)
  })

  test('the agent settings JSON reaches the session', async () => {
    const chat = makeChat()
    const agent = createAgent(db, { name: 'Assistant', cwd: '/va', settings: '{"enabledPlugins":{"telegram@claude-plugins-official":true}}' })
    const conv = createConversation(db, { agentId: agent.id, title: 'Main' })
    await chat.sendUserMessage({ conversationId: conv.id, text: 'hoi' })
    await flush()
    const call = tmux.calls.find(c => c.includes('new-session')) ?? []
    expect(JSON.parse(call[call.indexOf('--settings') + 1] ?? '{}').enabledPlugins).toEqual({ 'telegram@claude-plugins-official': true })
  })

  test('the agent extra arguments reach the session', async () => {
    const chat = makeChat()
    const agent = createAgent(db, { name: 'Assistant', cwd: '/va', extraArgs: '--channels plugin:telegram@claude-plugins-official' })
    const conv = createConversation(db, { agentId: agent.id, title: 'Main' })
    await chat.sendUserMessage({ conversationId: conv.id, text: 'hoi' })
    await flush()
    const call = tmux.calls.find(c => c.includes('new-session')) ?? []
    expect(call).toContain('plugin:telegram@claude-plugins-official')
  })

  test('SessionStart stores the claude session id for later resume', async () => {
    const chat = makeChat()
    const agent = createAgent(db, { name: 'A', cwd: '/tmp' })
    const conv = createConversation(db, { agentId: agent.id, title: 'x' })
    await chat.hook(conv.id, { hook_event_name: 'SessionStart', session_id: 'sess-42' })
    expect(getConversation(db, conv.id)?.claudeSessionId).toBe('sess-42')
  })

  test('notify posts into the main conversation of the named agent', async () => {
    const chat = makeChat()
    const agent = createAgent(db, { name: 'Assistant', cwd: '/tmp', alwaysOn: true })
    const main = createConversation(db, { agentId: agent.id, title: 'Main' }, at('2026-10-01T00:00:00Z'))
    createConversation(db, { agentId: agent.id, title: 'Side' }, at('2026-10-05T00:00:00Z'))
    await chat.notify({ agentName: 'assistant', text: 'Heartbeat: all good' })
    expect(listMessages(db, main.id).map(m => m.text)).toEqual(['Heartbeat: all good'])
    expect(pushes).toHaveLength(1)
  })

  test('supervise keeps always-on agents running and stops idle side conversations', async () => {
    const chat = makeChat()
    const va = createAgent(db, { name: 'Assistant', cwd: '/va', alwaysOn: true }, at('2026-10-01T00:00:00Z'))
    const side = createAgent(db, { name: 'Helper', cwd: '/tmp' }, at('2026-10-01T00:00:00Z'))

    await chat.supervise()
    const main = listConversations(db).find(c => c.agentId === va.id)
    expect(main?.title).toBe('Main')
    expect(tmux.running.has(sessionName(main?.id ?? ''))).toBe(true)

    const idle = createConversation(db, { agentId: side.id, title: 'old' }, at('2026-10-07T01:00:00Z'))
    await chat.sendUserMessage({ conversationId: idle.id, text: 'x' })
    await flush()
    clock = at('2026-10-07T17:00:00Z')
    await chat.supervise()
    expect(tmux.running.has(sessionName(idle.id))).toBe(false)
    expect(tmux.running.has(sessionName(main?.id ?? ''))).toBe(true)
  })
})

describe('attention', () => {
  test('chats whose messages did not get through need the owner; busy running chats are at work', async () => {
    const db = openSqliteChatDb(':memory:')
    const store = createSqliteChatStore(db)
    const now = at('2026-10-15T12:30:00Z')
    const agent = createAgent(db, { name: 'Assistant', cwd: '/va' })
    const main = createConversation(db, { agentId: agent.id, title: 'Main' })
    const side = createConversation(db, { agentId: agent.id, title: 'Trip' })
    const idle = createConversation(db, { agentId: agent.id, title: 'Idle' })
    addMessage(db, { conversationId: main.id, role: 'user', text: 'stuck', status: 'pending' }, at('2026-10-15T12:00:00Z'))
    addMessage(db, { conversationId: main.id, role: 'user', text: 'lost', status: 'failed' }, at('2026-10-15T12:29:00Z'))
    addMessage(db, { conversationId: side.id, role: 'user', text: 'just sent', status: 'pending' }, at('2026-10-15T12:29:00Z'))
    // An app note the agent has not picked up yet is not the owner's message.
    addMessage(db, { conversationId: idle.id, role: 'user', text: 'Acme replied', status: 'pending', origin: 'system' }, at('2026-10-15T12:00:00Z'))
    const chat = createChat({ store, sessions: createSessions({ ...sessionConfig, exec: fakeTmux().exec }), inbox: createInbox(), bus: createBus<ChatEvent>(), push: async () => {}, idleHours: 6, now: () => now, conversationUrl: id => `/c/${id}` })
    await chat.hook(side.id, { hook_event_name: 'UserPromptSubmit' })
    // Retried a minute ago: the clock starts again, so it does not count yet.
    const retried = addMessage(db, { conversationId: idle.id, role: 'user', text: 'old but retried', status: 'failed' }, at('2026-10-15T09:00:00Z'))
    await chat.retryMessage(idle.id, retried.id)
    // Activity left over from long ago (no Stop came) is not work.
    await chat.hook(idle.id, { hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: '/x.md' } })
    db.run(sql`update conversations set last_activity_at = ${at('2026-10-15T11:00:00Z').getTime()} where id = ${idle.id}`)

    const attention = await buildChatAttention({ store, running: [main.id, side.id, idle.id], now })

    expect(attention.undelivered).toEqual([{ conversationId: main.id, count: 2, title: 'Assistant' }])
    expect(attention.atWork.map(w => [w.title, w.activity])).toEqual([['Trip', 'Thinking']])
  })
})

describe('event stream', () => {
  test('a live topic reaches the browser as a topic event', async () => {
    const bus = createBus<ChatEvent>()
    const reader = busEventStream({ bus, toWire: wireEvent }).getReader()
    await reader.read() // the opening padding
    bus.publish({ type: 'topic', topic: 'mail.draft', data: { draftId: 'd1', conversationId: null, state: 'queued' } })
    const event = await reader.read()
    await reader.cancel()
    expect(JSON.parse(new TextDecoder().decode(event.value).replace(/^data: /, ''))).toEqual({
      type: 'topic', topic: 'mail.draft', data: { draftId: 'd1', conversationId: null, state: 'queued' },
    })
  })

  test('sends events as SSE data and stops cleanly when the client disconnects', async () => {
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => { unhandled.push(reason) }
    process.on('unhandledRejection', onUnhandled)
    const bus = createBus<ChatEvent>()
    const reader = busEventStream({ bus, toWire: e => e, pingMs: 1 }).getReader()
    await reader.read() // the opening padding
    bus.publish({ type: 'activity', conversationId: 'c', activity: null })
    const first = await reader.read()
    await reader.cancel()
    bus.publish({ type: 'activity', conversationId: 'c', activity: 'after' })
    await new Promise(r => setTimeout(r, 10))
    process.off('unhandledRejection', onUnhandled)
    expect(new TextDecoder().decode(first.value)).toBe('data: {"type":"activity","conversationId":"c","activity":null}\n\n')
    expect(unhandled).toEqual([])
  })

  // Regression: Caddy compresses responses and holds them until 512 bytes are ready, so a quiet
  // stream (a small ping every 25 s) reached the phone only after minutes, and the app looked
  // stuck and offline.
  test('opens with enough bytes for a compressing proxy to pass the stream on at once', async () => {
    const reader = busEventStream({ bus: createBus<ChatEvent>(), toWire: e => e }).getReader()
    const first = await reader.read()
    await reader.cancel()
    const text = new TextDecoder().decode(first.value)
    expect(text.length).toBeGreaterThanOrEqual(1024)
    expect(text.split('\n').filter(Boolean).every(line => line.startsWith(':') || line.startsWith('retry:'))).toBe(true)
  })

  // Regression: Bun closes a connection after 10 s without bytes, and the ping came every 25 s,
  // so the stream dropped every 12 s and replies sent in the gap never showed up.
  test('a quiet stream sends a ping before Bun\'s 10 second idle timeout', async () => {
    jest.useFakeTimers()
    try {
      const reader = busEventStream({ bus: createBus<ChatEvent>(), toWire: e => e }).getReader()
      await reader.read() // the opening padding
      jest.advanceTimersByTime(9_000)
      const ping = await Promise.race([reader.read(), new Promise(r => setImmediate(r, 'nothing yet'))])
      await reader.cancel()
      expect(ping).not.toBe('nothing yet')
    }
    finally {
      jest.useRealTimers()
    }
  })
})
