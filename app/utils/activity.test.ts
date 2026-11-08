import { expect, test } from 'bun:test'
import { MAX_STEPS, observeActivity, type ActivityBuffer } from './activity'

const at = (minute: number) => `2026-10-15T12:${String(minute).padStart(2, '0')}:00.000Z`

test('a run opens on activity, skips repeats (reconnect replays), closes when idle, then a new run starts', () => {
  let buffer: ActivityBuffer = {}
  buffer = observeActivity(buffer, 'c1', 'Reading groceries.md', at(1))
  buffer = observeActivity(buffer, 'c1', 'Reading groceries.md', at(2))
  buffer = observeActivity(buffer, 'c1', 'Running bun test', at(3))
  buffer = observeActivity(buffer, 'c1', null, at(4))
  const idle = observeActivity(buffer, 'c1', null, at(5))
  expect(idle).toBe(buffer)
  buffer = observeActivity(idle, 'c1', 'Searching the web', at(6))

  expect(buffer.c1).toEqual([
    {
      observedSince: at(1),
      endedAt: at(4),
      steps: [
        { at: at(1), text: 'Reading groceries.md', icon: 'i-lucide-file-text' },
        { at: at(3), text: 'Running bun test', icon: 'i-lucide-square-terminal' },
      ],
    },
    { observedSince: at(6), steps: [{ at: at(6), text: 'Searching the web', icon: 'i-lucide-globe' }] },
  ])
})

test('idle without an open run records nothing, and a long run keeps only the latest steps', () => {
  expect(observeActivity({}, 'c1', null, at(1))).toEqual({})

  let buffer: ActivityBuffer = {}
  for (let i = 0; i < MAX_STEPS + 5; i++) buffer = observeActivity(buffer, 'c1', `Running step ${i}`, at(1))
  const steps = buffer.c1![0]!.steps
  expect(steps).toHaveLength(MAX_STEPS)
  expect(steps.at(-1)!.text).toBe(`Running step ${MAX_STEPS + 4}`)
})
