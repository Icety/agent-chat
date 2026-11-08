import type { ChatStore, PushSubscriptionRow } from './ports'

export interface PushPayload {
  title: string
  body: string
  url: string
}

export type SendFn = (sub: PushSubscriptionRow, payload: string) => Promise<void>

const isGone = (err: unknown): boolean => {
  const status = (err as { statusCode?: number }).statusCode
  return status === 404 || status === 410
}

// Sends one notification to every subscribed device; devices that unsubscribed are forgotten.
export const createPusher = (deps: { store: ChatStore, send: SendFn }) => async (payload: PushPayload): Promise<void> => {
  const body = JSON.stringify(payload)
  await Promise.all((await deps.store.push.list()).map(async sub => {
    try {
      await deps.send(sub, body)
    }
    catch (err) {
      if (isGone(err)) {
        await deps.store.push.delete(sub.endpoint)
        return
      }
      console.error(`[push] send failed for ${new URL(sub.endpoint).host}`, err)
    }
  }))
}
