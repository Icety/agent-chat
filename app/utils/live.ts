// The part of EventSource the live stream uses, so a test can stand in for it.
export interface LiveSource {
  readonly readyState: number
  onopen: ((e: Event) => void) | null
  onerror: ((e: Event) => void) | null
  onmessage: ((e: MessageEvent) => void) | null
  close: () => void
}

const CLOSED = 2

// A server-sent event stream that keeps itself alive. EventSource retries a dropped connection
// on its own, but gives up for good once a retry gets an error response (a 502 while the server
// restarts after a deploy), and then no reply ever shows up until the app is reloaded.
export const openLiveStream = (deps: {
  open: () => LiveSource
  onOpen: () => void
  onDown: () => void
  onMessage: (data: string) => void
  retryMs?: number
}) => {
  let source: LiveSource | undefined
  let timer: ReturnType<typeof setTimeout> | undefined

  const start = () => {
    clearTimeout(timer)
    source?.close()
    const s = deps.open()
    source = s
    s.onopen = () => deps.onOpen()
    s.onmessage = e => deps.onMessage(String(e.data))
    s.onerror = () => {
      deps.onDown()
      if (s.readyState === CLOSED && source === s) timer = setTimeout(start, deps.retryMs ?? 3000)
    }
  }

  start()
  // Start over, e.g. when the app comes back from the background: a phone may have killed the
  // connection while it still looks open.
  return { restart: start }
}
