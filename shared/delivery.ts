// A message of the owner's "did not arrive": it failed, or it is still pending 10 minutes after it
// was sent or last retried. One rule for the thread and the home summary (SQL in the storage adapters).
export const UNDELIVERED_AFTER_MS = 10 * 60_000

export const isUndelivered = (message: { status: string, createdAt: string | Date, retriedAt: string | Date | null }, now: Date): boolean => {
  if (message.status === 'failed') return true
  if (message.status !== 'pending') return false
  const since = new Date(message.retriedAt ?? message.createdAt).getTime()
  return now.getTime() - since > UNDELIVERED_AFTER_MS
}
