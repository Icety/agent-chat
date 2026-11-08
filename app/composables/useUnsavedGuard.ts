import { toValue, type MaybeRefOrGetter } from 'vue'
import { unsavedEdits } from '../utils/unsaved'

// Keeps the app from reloading itself for a new version while `dirty` is true. Released when the
// calling component unmounts, or earlier with the returned function.
export const useUnsavedGuard = (dirty: MaybeRefOrGetter<boolean>): (() => void) => {
  const release = unsavedEdits.add(() => toValue(dirty))
  if (getCurrentScope()) onScopeDispose(release)
  return release
}

export const hasUnsavedEdits = (): boolean => unsavedEdits.dirty()
