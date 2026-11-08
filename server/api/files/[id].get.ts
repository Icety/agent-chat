import { createReadStream, statSync } from 'node:fs'
import { basename } from 'node:path'

export default defineOwnerHandler(event => {
  const path = useAgentChat().files.resolve(getRouterParam(event, 'id') ?? '')
  if (!path) throw createError({ statusCode: 404, statusMessage: 'File not found' })
  const name = basename(path).slice(37)
  setResponseHeaders(event, {
    'content-length': statSync(path).size,
    'content-disposition': `inline; filename="${name.replace(/"/g, '')}"`,
    'cache-control': 'private, max-age=31536000, immutable',
  })
  const mime = Bun.file(path).type
  if (mime) setResponseHeader(event, 'content-type', mime)
  return sendStream(event, createReadStream(path))
})
