import type { TopicName } from '../../shared/topics'
import type { LiveTopicHandler } from '../utils/topics'
import { liveTopics } from '../utils/topics'

// Listen to a live topic on the app's single event stream while the calling component lives.
// The handler gets the event data, or null after a reconnect (catch up: refetch).
export const useLiveTopic = <K extends TopicName>(topic: K, handler: LiveTopicHandler<K>): void => {
  useChat().connect()
  const off = liveTopics.on(topic, handler)
  if (getCurrentScope()) onScopeDispose(off)
}
