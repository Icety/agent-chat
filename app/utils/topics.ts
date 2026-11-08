import type { TopicData, TopicName } from '../../shared/topics'

// `null` means "the stream reconnected, you may have missed events": refetch everything you show.
export type LiveTopicHandler<K extends TopicName> = (data: TopicData<K> | null) => void

type AnyHandler = (data: unknown) => void

// Routes topic events from the one live stream to whoever listens to that topic.
export const createTopicRouter = () => {
  const handlers = new Map<string, Set<AnyHandler>>()

  const on = <K extends TopicName>(topic: K, handler: LiveTopicHandler<K>): (() => void) => {
    const set = handlers.get(topic) ?? new Set<AnyHandler>()
    handlers.set(topic, set)
    const h = handler as AnyHandler
    set.add(h)
    return () => { set.delete(h) }
  }

  const call = (handler: AnyHandler, data: unknown) => {
    try {
      handler(data)
    }
    catch (err) {
      console.error('[live] topic handler failed', err)
    }
  }

  const dispatch = (topic: string, data: unknown): void => {
    for (const h of handlers.get(topic) ?? []) call(h, data)
  }

  const reconnected = (): void => {
    for (const set of handlers.values()) for (const h of set) call(h, null)
  }

  return { on, dispatch, reconnected }
}

// The app's one router, fed by useChat's event stream.
export const liveTopics = createTopicRouter()
