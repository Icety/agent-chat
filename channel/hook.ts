#!/usr/bin/env bun
// Claude Code hook (SessionStart, UserPromptSubmit, PreToolUse, Stop): tells the app what the
// session is doing. Silent no-op outside agent-chat sessions. Never blocks claude.
import { readFileSync } from 'node:fs'

const conversationId = process.env.AGENT_CHAT_CONVERSATION
const tokenFile = process.env.AGENT_CHAT_TOKEN_FILE
if (!conversationId || !tokenFile) process.exit(0)

try {
  const event = JSON.parse(await new Response(Bun.stdin.stream()).text())
  await fetch(`${process.env.AGENT_CHAT_URL ?? 'http://127.0.0.1:3000'}/api/internal/hook`, {
    method: 'POST',
    headers: { 'authorization': `Bearer ${readFileSync(tokenFile, 'utf8').trim()}`, 'content-type': 'application/json' },
    body: JSON.stringify({ conversationId, event }),
    signal: AbortSignal.timeout(2000),
  })
}
catch (err) {
  process.stderr.write(`agent-chat hook: ${err}\n`)
}
process.exit(0)
