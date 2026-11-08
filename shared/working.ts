// "Working": the agent reports an activity and was active in the last 15 minutes. One rule for
// At work, the Running group, the Chats badge and the core summary (server and client).
export const WORKING_WINDOW_MS = 15 * 60_000

export const isWorking = (conversation: { activity: string | null, lastActivityAt: string | Date }, now: Date): boolean => {
  if (!conversation.activity) return false
  const last = new Date(conversation.lastActivityAt).getTime()
  return now.getTime() - last <= WORKING_WINDOW_MS
}
