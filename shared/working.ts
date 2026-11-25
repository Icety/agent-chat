// "Working": the agent reports an activity and was active in the last 15 minutes. One rule for
// At work, the Running group, the Chats badge and the core summary (server and client).
// An agent's main chat: the one called Main. Scripts and system notes land there, so it can neither be
// archived nor renamed.
export const MAIN_TITLE = 'Main'
export const isMainChat = (conversation: { title: string }): boolean => conversation.title === MAIN_TITLE

// The agent's main chat among its conversations: the one called Main (archived or not), else the
// oldest one that is not archived. Undefined when it has none.
export const pickMainConversation = <C extends { title: string, archived: boolean, createdAt: string | Date }>(conversations: C[]): C | undefined => {
  const byAge = (a: C, b: C) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  return [...conversations].filter(isMainChat).sort(byAge)[0] ?? [...conversations].filter(c => !c.archived).sort(byAge)[0]
}

export const WORKING_WINDOW_MS = 15 * 60_000

export const isWorking = (conversation: { activity: string | null, lastActivityAt: string | Date }, now: Date): boolean => {
  if (!conversation.activity) return false
  const last = new Date(conversation.lastActivityAt).getTime()
  return now.getTime() - last <= WORKING_WINDOW_MS
}
