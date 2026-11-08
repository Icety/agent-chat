import { inboxMessage } from '../../../lib/serialize'

const MAX_WAIT_MS = 30_000

export default defineInternalHandler(async event => {
  const { conversation, wait } = getQuery(event)
  if (typeof conversation !== 'string' || !conversation) throw createError({ statusCode: 400, statusMessage: 'conversation is required' })
  const waitMs = Math.min(Math.max(Number(wait) || 0, 0), MAX_WAIT_MS)
  const app = useAgentChat()
  return (await app.chat.takePending(conversation, waitMs)).map(m => inboxMessage(m, app.notePrefix))
})
