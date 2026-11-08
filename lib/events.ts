import type { Bus, ChatEvent } from './bus'

// Server-sent events for one client: every chat event plus a keep-alive ping, as `data: <json>`.
// Not h3's createEventStream: under Bun a client disconnect rejects its writer.closed promise,
// which h3 never handles, and the unhandled rejection makes Bun exit the whole app.
export const busEventStream = (deps: { bus: Bus<ChatEvent>, toWire: (e: ChatEvent) => unknown, pingMs?: number }): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder()
  let stop = () => {}
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        }
        catch {
          stop()
        }
      }
      // Caddy compresses responses and holds them until 512 bytes are ready, so open with a
      // padded comment line: the stream then reaches the browser at once instead of after minutes.
      controller.enqueue(encoder.encode(`retry: 3000\n:${' '.repeat(2048)}\n\n`))
      const unsubscribe = deps.bus.subscribe(e => send(deps.toWire(e)))
      // Bun closes a connection after 10 s without bytes, so ping well within that.
      const ping = setInterval(() => send({ type: 'ping' }), deps.pingMs ?? 8_000)
      stop = () => {
        clearInterval(ping)
        unsubscribe()
      }
    },
    // Bun cancels the response body when the client goes away.
    cancel() {
      stop()
    },
  })
}
