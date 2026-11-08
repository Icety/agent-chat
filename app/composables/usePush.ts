const urlBase64ToUint8Array = (base64: string): Uint8Array<ArrayBuffer> => {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

const READY_TIMEOUT_MS = 10_000

// navigator.serviceWorker.ready never settles when the worker failed to start; fail loudly instead.
const workerReady = (appName: string): Promise<ServiceWorkerRegistration> => Promise.race([
  navigator.serviceWorker.ready,
  new Promise<never>((_, reject) => setTimeout(
    () => reject(new Error(`The app's background worker is not running. Close ${appName} completely and open it again.`)),
    READY_TIMEOUT_MS,
  )),
])

export const usePush = () => {
  const { vapidPublicKey } = useRuntimeConfig().public
  const appName = useAppConfig().agentChat.appName
  const supported = computed(() => import.meta.client && 'serviceWorker' in navigator && 'PushManager' in window && Boolean(vapidPublicKey))
  const subscribed = useState<boolean>('push-subscribed', () => false)
  const permission = useState<NotificationPermission | 'unsupported'>('push-permission', () => 'default')

  const refresh = async () => {
    if (!supported.value) {
      permission.value = 'unsupported'
      return
    }
    permission.value = Notification.permission
    try {
      const reg = await workerReady(appName)
      subscribed.value = Boolean(await reg.pushManager.getSubscription())
    }
    catch (err) {
      console.error('[push] could not read the subscription', err)
      subscribed.value = false
    }
  }

  const enable = async () => {
    if (!supported.value) return
    const result = await Notification.requestPermission()
    permission.value = result
    if (result !== 'granted') return
    const reg = await workerReady(appName)
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    })
    await $fetch('/api/push/subscribe', { method: 'POST', body: sub.toJSON() })
    subscribed.value = true
  }

  const disable = async () => {
    const reg = await workerReady(appName)
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      await $fetch('/api/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } })
      await sub.unsubscribe()
    }
    subscribed.value = false
  }

  const test = () => $fetch('/api/push/test', { method: 'POST' })

  return { supported, subscribed, permission, refresh, enable, disable, test }
}
