#!/usr/bin/env bun
// Agent chat channel for Claude Code. Long-polls the app for messages of one conversation
// (AGENT_CHAT_CONVERSATION) and exposes a reply tool back to the app. Started by claude as an MCP
// server; its environment comes from the tmux session agent-chat starts (lib/sessions.ts).
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { readFileSync } from 'node:fs'
import { channelInstructions, createClient, toNotification } from './lib'

const env = process.env
const serverName = env.AGENT_CHAT_SERVER_NAME || 'agent-chat'
const appName = env.AGENT_CHAT_APP_NAME || 'chat'
const log = (msg: string) => process.stderr.write(`${serverName}: ${msg}\n`)

const conversationId = env.AGENT_CHAT_CONVERSATION ?? ''
const url = env.AGENT_CHAT_URL ?? 'http://127.0.0.1:3000'
const tokenFile = env.AGENT_CHAT_TOKEN_FILE ?? ''

const readFile = (path: string, what: string): string => {
  if (!path) return ''
  try {
    return readFileSync(path, 'utf8').trim()
  }
  catch (err) {
    log(`cannot read ${what} ${path}: ${err}`)
    return ''
  }
}

const client = createClient({ url, token: readFile(tokenFile, 'token file'), conversationId })

const mcp = new Server(
  { name: serverName, version: '0.1.0' },
  {
    capabilities: {
      tools: {},
      experimental: { 'claude/channel': {} },
    },
    instructions: channelInstructions({ appName, serverName, extra: readFile(env.AGENT_CHAT_INSTRUCTIONS_FILE ?? '', 'instructions file') }),
  },
)

mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'reply',
      description: `Send a message to the person in the ${appName} app. Markdown is rendered. Pass absolute file paths in files to send images or documents.`,
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          files: { type: 'array', items: { type: 'string' }, description: 'Absolute paths of files to attach.' },
        },
        required: ['text'],
      },
    },
  ],
}))

mcp.setRequestHandler(CallToolRequestSchema, async req => {
  if (req.params.name !== 'reply') {
    return { content: [{ type: 'text', text: `unknown tool ${req.params.name}` }], isError: true }
  }
  const args = (req.params.arguments ?? {}) as { text?: unknown, files?: unknown }
  const text = typeof args.text === 'string' ? args.text : ''
  const files = Array.isArray(args.files) ? args.files.filter((f): f is string => typeof f === 'string') : []
  try {
    await client.reply(text, files)
    return { content: [{ type: 'text', text: 'sent' }] }
  }
  catch (err) {
    return { content: [{ type: 'text', text: `reply failed: ${err}` }], isError: true }
  }
})

let stopping = false

const pollLoop = async (): Promise<void> => {
  if (!conversationId) {
    log('AGENT_CHAT_CONVERSATION is not set; inbound messages are disabled')
    return
  }
  let failures = 0
  while (!stopping) {
    try {
      const batch = await client.poll(25_000)
      for (const message of batch) {
        await mcp.notification(toNotification(conversationId, message))
      }
      if (batch.length > 0) await client.ack(batch.map(m => m.id))
      failures = 0
    }
    catch (err) {
      failures++
      const delay = Math.min(1000 * failures, 15_000)
      log(`poll failed (${err}); retrying in ${delay / 1000}s`)
      await new Promise(r => setTimeout(r, delay))
    }
  }
}

// Claude registers its channel handler a moment after the MCP handshake. A notification
// sent before that is dropped, so start polling only after initialization plus a grace period.
const START_DELAY_MS = 3000
mcp.oninitialized = () => {
  setTimeout(() => { void pollLoop() }, START_DELAY_MS)
}

await mcp.connect(new StdioServerTransport())
process.stdin.on('close', () => { stopping = true })
