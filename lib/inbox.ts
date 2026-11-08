// Long-poll wake-ups for the channel plugin: one waiter set per conversation.
export interface Inbox {
  notify: (conversationId: string) => void
  wait: (conversationId: string, timeoutMs: number) => Promise<boolean>
}

export const createInbox = (): Inbox => {
  const waiters = new Map<string, Set<(woken: boolean) => void>>()

  const notify = (conversationId: string): void => {
    const set = waiters.get(conversationId)
    if (!set) return
    waiters.delete(conversationId)
    for (const wake of set) wake(true)
  }

  const wait = (conversationId: string, timeoutMs: number): Promise<boolean> =>
    new Promise(resolve => {
      const set = waiters.get(conversationId) ?? new Set()
      waiters.set(conversationId, set)
      const timer = setTimeout(() => {
        set.delete(wake)
        resolve(false)
      }, timeoutMs)
      const wake = (woken: boolean) => {
        clearTimeout(timer)
        resolve(woken)
      }
      set.add(wake)
    })

  return { notify, wait }
}
