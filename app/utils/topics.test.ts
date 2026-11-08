import { expect, test } from 'bun:test'
import { createTopicRouter } from './topics'

test('a topic reaches its own listeners; after a reconnect every listener catches up', () => {
  const router = createTopicRouter()
  const heard: string[] = []
  router.on('home.summary', data => heard.push(`home ${(data as { source: string } | null)?.source ?? 'catch-up'}`))
  const off = router.on('home.summary', () => { throw new Error('broken listener') })
  router.dispatch('home.summary', { source: 'gym' })
  router.dispatch('other.topic', { source: 'nope' })
  off()
  router.reconnected()

  expect(heard).toEqual(['home gym', 'home catch-up'])
})
