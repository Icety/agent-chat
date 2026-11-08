import type { Attachment } from '../../../../lib/ports'
import { publicMessage } from '../../../../lib/serialize'

const MAX_BYTES = 50 * 1024 * 1024

// Multipart: text (field), files (0..n), voice (0..1, transcribed before delivery).
export default defineOwnerHandler(async event => {
  const id = getRouterParam(event, 'id') ?? ''
  const { store, files, chat, transcribe } = useAgentChat()
  if (!(await store.conversations.get(id))) throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })

  const parts = (await readMultipartFormData(event)) ?? []
  let text = ''
  const attachments: Attachment[] = []
  let voice: Attachment | undefined

  for (const part of parts) {
    if (part.name === 'text') {
      text = part.data.toString('utf8').slice(0, 20_000)
      continue
    }
    if (!part.filename) continue
    if (part.data.byteLength > MAX_BYTES) throw createError({ statusCode: 413, statusMessage: `${part.filename} is larger than 50 MB` })
    const saved = await files.save(id, part.filename, part.type ?? 'application/octet-stream', part.data)
    attachments.push(saved)
    if (part.name === 'voice') voice = saved
  }

  if (!text.trim() && attachments.length === 0) throw createError({ statusCode: 400, statusMessage: 'Empty message' })

  const transcript = voice ? await transcribe(voice.path).catch(err => {
    console.error(`[agent-chat] transcription failed for ${voice?.path}`, err)
    return null
  }) : null

  return publicMessage(await chat.sendUserMessage({ conversationId: id, text, attachments, transcript }))
})
