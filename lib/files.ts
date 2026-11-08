import { mkdirSync, copyFileSync, statSync, readdirSync } from 'node:fs'
import { basename, join, extname } from 'node:path'
import type { Attachment } from './ports'

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.heic': 'image/heic', '.pdf': 'application/pdf', '.txt': 'text/plain', '.md': 'text/markdown',
  '.csv': 'text/csv', '.ics': 'text/calendar', '.json': 'application/json', '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.webm': 'audio/webm', '.wav': 'audio/wav',
}

export const attachmentKind = (mime: string): Attachment['kind'] => {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('audio/')) return 'audio'
  return 'file'
}

const safeName = (name: string): string =>
  basename(name).replace(/[^\w.\-]+/g, '_').replace(/^\.+/, '').slice(0, 120) || 'file'

// Files live in <dataDir>/<conversationId>/<id>-<name>. The id is enough to find them.
export const createFiles = (dataDir: string) => {
  const save = async (conversationId: string, name: string, mime: string, bytes: Uint8Array): Promise<Attachment> => {
    const id = crypto.randomUUID()
    const dir = join(dataDir, safeName(conversationId))
    mkdirSync(dir, { recursive: true })
    const path = join(dir, `${id}-${safeName(name)}`)
    await Bun.write(path, bytes)
    return { id, name: safeName(name), mime, size: bytes.byteLength, path, kind: attachmentKind(mime) }
  }

  const importPath = async (conversationId: string, sourcePath: string): Promise<Attachment> => {
    const id = crypto.randomUUID()
    const name = safeName(sourcePath)
    const dir = join(dataDir, safeName(conversationId))
    mkdirSync(dir, { recursive: true })
    const path = join(dir, `${id}-${name}`)
    copyFileSync(sourcePath, path)
    const mime = MIME_BY_EXT[extname(name).toLowerCase()] ?? 'application/octet-stream'
    return { id, name, mime, size: statSync(path).size, path, kind: attachmentKind(mime) }
  }

  const resolve = (id: string): string | null => {
    if (!/^[0-9a-f-]{36}$/.test(id)) return null
    for (const dir of readdirSync(dataDir, { withFileTypes: true })) {
      if (!dir.isDirectory()) continue
      const hit = readdirSync(join(dataDir, dir.name)).find(f => f.startsWith(`${id}-`))
      if (hit) return join(dataDir, dir.name, hit)
    }
    return null
  }

  return { save, importPath, resolve }
}

export type Files = ReturnType<typeof createFiles>
