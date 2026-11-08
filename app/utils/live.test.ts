import { expect, test } from 'bun:test'
import { openLiveStream, type LiveSource } from './live'

const fakeSource = (): LiveSource & { readyState: number } => ({
  readyState: 0, onopen: null, onerror: null, onmessage: null,
  close() { this.readyState = 2 },
})

// Regression: after a deploy the server answers the browser's retry with a 502, EventSource
// closes for good, and replies never arrived until the app was reloaded.
test('opens a new stream when the browser gives up on the old one', async () => {
  const opened: ReturnType<typeof fakeSource>[] = []
  const events: string[] = []
  openLiveStream({
    open: () => { const s = fakeSource(); opened.push(s); return s },
    onOpen: () => events.push('open'),
    onDown: () => events.push('down'),
    onMessage: data => events.push(data),
    retryMs: 1,
  })

  opened[0]!.readyState = 2
  opened[0]!.onerror?.(new Event('error'))
  await new Promise(r => setTimeout(r, 10))
  opened[1]?.onopen?.(new Event('open'))
  opened[1]?.onmessage?.(new MessageEvent('message', { data: '{"type":"ping"}' }))

  expect(opened).toHaveLength(2)
  expect(events).toEqual(['down', 'open', '{"type":"ping"}'])
})
