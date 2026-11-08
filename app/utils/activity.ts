// What this device saw an agent do, per conversation: the server only sends the current activity
// line, so the client keeps the lines it saw as runs of steps (KActivityReceipt). A run opens on the
// first activity and closes when the activity clears. Nothing from before the device was watching.

export interface ActivityStep {
  at: string
  text: string
  icon: string
}

export interface ActivityRun {
  // ISO time this device first saw the run.
  observedSince: string
  steps: ActivityStep[]
  // ISO time the activity cleared; open while undefined.
  endedAt?: string
}

export type ActivityBuffer = Record<string, ActivityRun[]>

export const MAX_RUNS = 20
export const MAX_STEPS = 60

// Icons for the lines layers/core/server/services/activity.ts writes.
const ICONS: [RegExp, string][] = [
  [/^Running /, 'i-lucide-square-terminal'],
  [/^Reading /, 'i-lucide-file-text'],
  [/^Editing /, 'i-lucide-file-pen'],
  [/^Searching the web/, 'i-lucide-globe'],
  [/^Searching /, 'i-lucide-search'],
  [/^Delegating/, 'i-lucide-users'],
  [/^Planning/, 'i-lucide-list-todo'],
  [/^Using /, 'i-lucide-plug'],
]

export const activityIcon = (text: string): string =>
  ICONS.find(([pattern]) => pattern.test(text))?.[1] ?? 'i-lucide-circle-dot'

// The buffer after this device saw `activity` (null: idle) for a conversation at `at`.
// Returns the same object when nothing changed, so callers can skip a state write.
export const observeActivity = (buffer: ActivityBuffer, conversationId: string, activity: string | null, at: string): ActivityBuffer => {
  const runs = buffer[conversationId] ?? []
  const open = runs.at(-1)?.endedAt === undefined ? runs.at(-1) : undefined

  if (!activity) {
    if (!open) return buffer
    return { ...buffer, [conversationId]: [...runs.slice(0, -1), { ...open, endedAt: at }] }
  }

  const step: ActivityStep = { at, text: activity, icon: activityIcon(activity) }
  if (!open) {
    const next = [...runs, { observedSince: at, steps: [step] }].slice(-MAX_RUNS)
    return { ...buffer, [conversationId]: next }
  }
  if (open.steps.at(-1)?.text === activity) return buffer
  const steps = [...open.steps, step].slice(-MAX_STEPS)
  return { ...buffer, [conversationId]: [...runs.slice(0, -1), { ...open, steps }] }
}
