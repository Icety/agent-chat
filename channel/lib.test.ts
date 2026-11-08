import { describe, expect, test } from 'bun:test'
import { channelInstructions, toNotification, createClient, type InboxMessage } from './lib'

const msg = (over: Partial<InboxMessage> = {}): InboxMessage => ({
  id: 'm1',
  text: 'Hoi',
  transcript: null,
  attachments: [],
  createdAt: '2026-10-07T10:00:00.000Z',
  ...over,
})

describe('toNotification', () => {
  test('plain text message', () => {
    expect(toNotification('c1', msg())).toEqual({
      method: 'notifications/claude/channel',
      params: {
        content: 'Hoi',
        meta: { conversation_id: 'c1', message_id: 'm1', ts: '2026-10-07T10:00:00.000Z' },
      },
    })
  })

  test('voice note uses the transcript and points at the audio', () => {
    const n = toNotification('c1', msg({
      text: '',
      transcript: 'Kun je brood kopen',
      attachments: [{ path: '/data/c1/a-voice.webm', kind: 'audio', name: 'voice.webm' }],
    }))
    expect(n.params.content).toBe('[voice note] Kun je brood kopen')
    expect(n.params.meta.files).toBe('/data/c1/a-voice.webm')
  })

  test('images and files are listed as paths; the first image also as image_path', () => {
    const n = toNotification('c1', msg({
      attachments: [
        { path: '/data/c1/a-plan.pdf', kind: 'file', name: 'plan.pdf' },
        { path: '/data/c1/b-photo.jpg', kind: 'image', name: 'photo.jpg' },
      ],
    }))
    expect(n.params.meta.image_path).toBe('/data/c1/b-photo.jpg')
    expect(n.params.meta.files).toBe('/data/c1/a-plan.pdf;/data/c1/b-photo.jpg')
  })
})

describe('client', () => {
  test('poll, ack and reply call the internal API with the token', async () => {
    const requests: { url: string, method: string, auth: string | null, body: string | null }[] = []
    const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      requests.push({
        url,
        method: init?.method ?? 'GET',
        auth: new Headers(init?.headers).get('authorization'),
        body: typeof init?.body === 'string' ? init.body : null,
      })
      if (url.includes('/inbox')) return Response.json([msg()])
      return Response.json({ ok: true })
    }) as typeof fetch

    const client = createClient({ url: 'http://127.0.0.1:3100', token: 'secret', conversationId: 'c1', fetch: fakeFetch })
    expect(await client.poll(25_000)).toEqual([msg()])
    await client.ack(['m1'])
    await client.reply('Klaar!', ['/tmp/x.png'])

    expect(requests[0]?.url).toBe('http://127.0.0.1:3100/api/internal/inbox?conversation=c1&wait=25000')
    expect(requests.every(r => r.auth === 'Bearer secret')).toBe(true)
    expect(JSON.parse(requests[1]?.body ?? '{}')).toEqual({ ids: ['m1'] })
    expect(JSON.parse(requests[2]?.body ?? '{}')).toEqual({ conversationId: 'c1', text: 'Klaar!', files: ['/tmp/x.png'] })
  })

  test('a failing request throws with the status', async () => {
    const fakeFetch = (async () => new Response('nope', { status: 401 })) as unknown as typeof fetch
    const client = createClient({ url: 'http://x', token: 't', conversationId: 'c1', fetch: fakeFetch })
    await expect(client.ack(['m1'])).rejects.toThrow('401')
  })
})

// The host's own rules (who may change the app) must reach claude: they are the agent's only copy.
test('instructions name the app and its channel, and end with the host rules', () => {
  const text = channelInstructions({ appName: 'Toadette', serverName: 'toadette-web', extra: 'Only the Builder changes the app.' })
  expect(text).toContain('reads the Toadette app')
  expect(text).toContain('<channel source="toadette-web"')
  expect(text.endsWith('\n\nOnly the Builder changes the app.')).toBe(true)
  expect(channelInstructions({ appName: 'X', serverName: 'x' })).not.toContain('Builder')
})
