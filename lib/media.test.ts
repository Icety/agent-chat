import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openSqliteChatDb } from './storage/sqlite/client'
import { createSqliteChatStore } from './storage/sqlite/store'
import type { ChatStore } from './ports'
import { createPusher, type SendFn } from './push'
import { createFiles, attachmentKind } from './files'
import { createTranscriber } from './transcribe'
import type { Exec } from './sessions'

describe('push', () => {
  let store: ChatStore
  beforeEach(() => { store = createSqliteChatStore(openSqliteChatDb(':memory:')) })

  test('sends to every subscription and drops the ones that are gone', async () => {
    await store.push.save({ endpoint: 'https://push/ok', p256dh: 'k', auth: 'a' })
    await store.push.save({ endpoint: 'https://push/gone', p256dh: 'k', auth: 'a' })
    const sent: string[] = []
    const send: SendFn = async (sub, payload) => {
      sent.push(`${sub.endpoint} ${payload}`)
      if (sub.endpoint.endsWith('gone')) throw Object.assign(new Error('gone'), { statusCode: 410 })
    }
    const pusher = createPusher({ store, send })
    await pusher({ title: 'Assistant', body: 'hi', url: '/c/1' })
    expect(sent).toHaveLength(2)
    expect(JSON.parse(sent[0]?.split(' ').slice(1).join(' ') ?? '{}')).toEqual({ title: 'Assistant', body: 'hi', url: '/c/1' })
    expect((await store.push.list()).map(s => s.endpoint)).toEqual(['https://push/ok'])
  })
})

describe('files', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'agent-chat-files-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  test('stores uploads per conversation with a safe name and finds them again', async () => {
    const files = createFiles(dir)
    const att = await files.save('conv-1', '../../etc/pass wd.png', 'image/png', new TextEncoder().encode('png!'))
    expect(att.kind).toBe('image')
    expect(att.path.startsWith(join(dir, 'conv-1'))).toBe(true)
    expect(att.path.includes('..')).toBe(false)
    expect(readFileSync(att.path, 'utf8')).toBe('png!')
    expect(files.resolve(att.id)).toBe(att.path)
  })

  test('imports a file the assistant points at by copying it', async () => {
    const files = createFiles(dir)
    const src = join(dir, 'report.pdf')
    await Bun.write(src, 'pdf')
    const att = await files.importPath('conv-2', src)
    expect(att.kind).toBe('file')
    expect(existsSync(att.path)).toBe(true)
    expect(att.path).not.toBe(src)
  })

  test('kind from mime type', () => {
    expect(attachmentKind('audio/webm')).toBe('audio')
    expect(attachmentKind('image/jpeg')).toBe('image')
    expect(attachmentKind('application/pdf')).toBe('file')
  })
})

describe('transcribe', () => {
  test('converts with ffmpeg, runs whisper and returns trimmed text', async () => {
    const calls: string[][] = []
    const exec: Exec = async args => {
      calls.push(args)
      if (args[0] === 'whisper') return { code: 0, stdout: '\n Hallo, kun je de boodschappen doen? \n', stderr: '' }
      return { code: 0, stdout: '', stderr: '' }
    }
    const transcribe = createTranscriber({ whisperBin: 'whisper', model: '/m/ggml-base.bin', lang: 'nl', exec })
    expect(await transcribe('/data/voice.webm')).toBe('Hallo, kun je de boodschappen doen?')
    expect(calls[0]?.[0]).toBe('ffmpeg')
    expect(calls[1]).toContain('-l')
    expect(calls[1]).toContain('nl')
  })

  test('returns null when whisper is not configured', async () => {
    const transcribe = createTranscriber({ whisperBin: '', model: '', lang: 'nl', exec: async () => ({ code: 0, stdout: '', stderr: '' }) })
    expect(await transcribe('/x.webm')).toBeNull()
  })
})
