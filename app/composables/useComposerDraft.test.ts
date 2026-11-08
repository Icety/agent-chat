import { expect, test } from 'bun:test'
import { effectScope, ref } from 'vue'
import { useComposerDraft } from './useComposerDraft'

test('a sending draft stays locked across remounts and settles on its original conversation', () => {
  const conversationId = crypto.randomUUID()
  const key = ref(conversationId)
  const firstScope = effectScope()
  const first = firstScope.run(() => useComposerDraft(key))!
  first.text.value = 'Hello'
  const sent = first.draft.value
  sent.sending = true
  firstScope.stop()

  const nextScope = effectScope()
  try {
    const reopened = nextScope.run(() => useComposerDraft(key))!
    expect(reopened.sending.value).toBe(true)
    expect(reopened.text.value).toBe('Hello')
    key.value = crypto.randomUUID()
    expect(reopened.sending.value).toBe(false)
    sent.sending = false
    key.value = conversationId
    expect(reopened.sending.value).toBe(false)
  }
  finally { nextScope.stop() }
})
