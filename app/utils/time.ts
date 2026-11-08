// Times are stored in UTC and shown in one zone (app config agentChat.timeZone), whatever the
// device's zone.
const LOCALE = 'en-GB'

export type ChatTimeFormat = 'time' | 'short' | 'day' | 'relative'

const cache = new Map<string, Intl.DateTimeFormat>()
const fmt = (timeZone: string, name: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat => {
  const key = `${timeZone}|${name}`
  const hit = cache.get(key)
  if (hit) return hit
  const made = new Intl.DateTimeFormat(name === 'key' ? 'en-CA' : LOCALE, { timeZone, ...options })
  cache.set(key, made)
  return made
}
const formats = (tz: string) => ({
  time: fmt(tz, 'time', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
  day: fmt(tz, 'day', { weekday: 'short', day: 'numeric', month: 'short' }),
  weekday: fmt(tz, 'weekday', { weekday: 'short' }),
  short: fmt(tz, 'short', { day: 'numeric', month: 'short' }),
  shortYear: fmt(tz, 'shortYear', { day: 'numeric', month: 'short', year: 'numeric' }),
  key: fmt(tz, 'key', { year: 'numeric', month: '2-digit', day: '2-digit' }),
})

// Whole calendar days between two instants, counted on the zone's calendar (DST-safe).
const dayDiff = (tz: string, from: Date, to: Date): number => {
  const day = (d: Date) => Date.parse(`${formats(tz).key.format(d)}T00:00:00Z`)
  return Math.round((day(to) - day(from)) / 86_400_000)
}

const relative = (tz: string, date: Date, now: Date): string => {
  const f = formats(tz)
  const minutes = Math.round((date.getTime() - now.getTime()) / 60_000)
  if (Math.abs(minutes) < 1) return 'just now'
  if (minutes < 0 && minutes > -60) return `${-minutes}m ago`
  if (minutes > 0 && minutes < 60) return `in ${minutes}m`
  const days = dayDiff(tz, now, date)
  if (days === 0) return f.time.format(date)
  if (days === -1) return 'Yesterday'
  if (days === 1) return 'Tomorrow'
  if (days < 0 && days > -7) return f.weekday.format(date)
  return f.key.format(date).slice(0, 4) === f.key.format(now).slice(0, 4) ? f.short.format(date) : f.shortYear.format(date)
}

/**
 * - time: "14:02"
 * - short: "14:02" (same day), else "17 Oct"
 * - day: "Sat 17 Oct"
 * - relative: "just now", "5m ago", "14:02" (same day), "Yesterday", "Tue" (this week), "17 Oct", "17 Oct 2025"
 * Returns an empty string for an invalid timestamp.
 */
export const formatChatTime = (iso: string | Date, format: ChatTimeFormat, timeZone: string, now: Date = new Date()): string => {
  const date = iso instanceof Date ? iso : new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const f = formats(timeZone)
  if (format === 'time') return f.time.format(date)
  if (format === 'short') return dayDiff(timeZone, now, date) === 0 ? f.time.format(date) : f.short.format(date)
  if (format === 'day') return f.day.format(date).replace(',', '')
  return relative(timeZone, date, now)
}
