import { expect, test } from 'bun:test'
import { formatChatTime } from './time'

// The zone is the host's choice: the same instant reads differently per zone, on the zone's calendar.
test.each([
  ['time in Amsterdam', '2026-10-15T22:30:00Z', 'time', 'Europe/Amsterdam', '00:30'],
  ['time in UTC', '2026-10-15T22:30:00Z', 'time', 'UTC', '22:30'],
  ['yesterday on the zone calendar', '2026-10-14T21:30:00Z', 'relative', 'Europe/Amsterdam', 'Yesterday'],
  ['same instant still today in UTC', '2026-10-15T09:30:00Z', 'relative', 'UTC', '09:30'],
  ['day label', '2026-10-17T10:00:00Z', 'day', 'Europe/Amsterdam', 'Sat 17 Oct'],
  ['invalid', 'nope', 'time', 'UTC', ''],
] as const)('formatChatTime: %s', (_, iso, format, zone, expected) => {
  expect(formatChatTime(iso, format, zone, new Date('2026-10-15T12:00:00Z'))).toBe(expected)
})
