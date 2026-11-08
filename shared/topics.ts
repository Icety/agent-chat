// Live topics: small invalidation signals on the one event stream. A client that hears a topic
// refetches what it shows; the data only says what changed, never the new state itself.
// Hosts and features type their topics with module augmentation:
//   declare module '@icety/agent-chat/shared/topics' { interface TopicMap { 'gym.plan': { planId: string } } }
// Unknown topic names still work, with untyped data.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface TopicMap {}

export type TopicName = keyof TopicMap | (string & {})

export type TopicData<K extends TopicName> = K extends keyof TopicMap ? TopicMap[K] : unknown
