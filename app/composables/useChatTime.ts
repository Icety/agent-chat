import { formatChatTime, type ChatTimeFormat } from '../utils/time'

// Labels that stay current: "just now" becomes "1m ago" without a reload. One shared clock for
// the whole app, ticking every 30 seconds while something uses it. Shown in agentChat.timeZone.
const TICK_MS = 30_000
const now = ref(new Date())
let users = 0
let timer: ReturnType<typeof setInterval> | undefined

export const useChatTime = () => {
  if (import.meta.client && getCurrentInstance()) {
    onMounted(() => {
      users++
      now.value = new Date()
      timer ??= setInterval(() => { now.value = new Date() }, TICK_MS)
    })
    onBeforeUnmount(() => {
      users--
      if (users > 0 || !timer) return
      clearInterval(timer)
      timer = undefined
    })
  }
  const timeZone = useAppConfig().agentChat.timeZone
  const format = (iso: string | Date, mode: ChatTimeFormat): string => formatChatTime(iso, mode, timeZone, now.value)
  return { now: readonly(now), format, timeZone }
}
