import { computed, reactive, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { unsavedEdits } from '../utils/unsaved'

// What the owner typed or attached but did not send yet, per conversation (or another key such as
// 'ask'). Lives outside the composer, so collapsing a sheet or switching panes keeps it,
// and the app does not reload itself for a new version while any draft holds something.
export interface ComposerDraft {
  text: string
  files: File[]
  sending: boolean
}

const drafts = reactive(new Map<string, ComposerDraft>())
let guarded = false

const isEmpty = (draft: ComposerDraft) => draft.text.trim() === '' && draft.files.length === 0
const ensure = (key: string) => {
  if (!drafts.has(key)) drafts.set(key, { text: '', files: [], sending: false })
}

// Prefill a composer before opening its chat ("I want a new layer for ").
export const setComposerDraft = (key: string, text: string): void => {
  ensure(key)
  drafts.get(key)!.text = text
}

export const useComposerDraft = (key: MaybeRefOrGetter<string>) => {
  if (!guarded && import.meta.client) {
    guarded = true
    unsavedEdits.add(() => [...drafts.values()].some(d => !isEmpty(d)))
  }

  ensure(toValue(key))
  watch(() => toValue(key), ensure, { flush: 'sync' })
  const draft = computed<ComposerDraft>(() => drafts.get(toValue(key)) ?? { text: '', files: [], sending: false })

  const text = computed({
    get: () => draft.value.text,
    set: (value: string) => { draft.value.text = value },
  })
  const files = computed({
    get: () => draft.value.files,
    set: (value: File[]) => { draft.value.files = value },
  })

  const sending = computed(() => draft.value.sending)

  return { text, files, sending, draft }
}
