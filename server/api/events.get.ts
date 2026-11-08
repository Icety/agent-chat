import { busEventStream } from '../../lib/events'
import { wireEvent } from '../../lib/serialize'

// Server-sent events: every chat change for the open app. The client reconnects on its own.
export default defineOwnerHandler(event => {
  setResponseHeaders(event, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    'connection': 'keep-alive',
    'x-accel-buffering': 'no',
  })
  return busEventStream({ bus: useAgentChat().bus, toWire: wireEvent })
})
