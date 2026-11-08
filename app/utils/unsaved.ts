// Screens with edits that are not saved yet (a doc, a mail draft) register here, so nothing
// reloads the app under them.
export const createUnsavedRegistry = () => {
  const guards = new Set<() => boolean>()
  const add = (isDirty: () => boolean): (() => void) => {
    guards.add(isDirty)
    return () => { guards.delete(isDirty) }
  }
  const dirty = (): boolean => [...guards].some(isDirty => isDirty())
  return { add, dirty }
}

export const unsavedEdits = createUnsavedRegistry()
