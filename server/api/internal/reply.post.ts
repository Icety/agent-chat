import { z } from 'zod'
import { existsSync } from 'node:fs'
import type { Attachment } from '../../../lib/ports'

const schema = z.object({
  conversationId: z.string().min(1),
  text: z.string().max(100_000),
  files: z.array(z.string().startsWith('/')).max(20).default([]),
})

export default defineInternalHandler(async event => {
  const input = await readValidatedBody(event, schema.parse)
  const { chat, files } = useAgentChat()
  const attachments: Attachment[] = []
  for (const path of input.files) {
    if (!existsSync(path)) throw createError({ statusCode: 400, statusMessage: `File not found: ${path}` })
    attachments.push(await files.importPath(input.conversationId, path))
  }
  const message = await chat.assistantReply({ conversationId: input.conversationId, text: input.text, attachments })
  return { ok: true, id: message.id }
})
