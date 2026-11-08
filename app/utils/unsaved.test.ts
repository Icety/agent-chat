import { expect, test } from 'bun:test'
import { createUnsavedRegistry } from './unsaved'

// A screen that forgot to release its guard would block every app update until a manual reload.
test('dirty while any registered screen is dirty, and not after it is released', () => {
  const registry = createUnsavedRegistry()
  let editing = true
  const release = registry.add(() => editing)
  registry.add(() => false)
  expect(registry.dirty()).toBe(true)
  editing = false
  expect(registry.dirty()).toBe(false)
  editing = true
  release()
  expect(registry.dirty()).toBe(false)
})
