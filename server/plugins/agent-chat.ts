import { seedDefaultAgent } from '../../lib/runtime'

const SUPERVISE_EVERY_MS = 60_000

// Seeds the default agent once, then keeps always-on agents running and stops idle side chats.
// Waits for the host: it registers itself from its own plugin or boot code.
export default defineNitroPlugin(nitroApp => {
  let seeded = false
  let warned = false
  const tick = async (): Promise<void> => {
    if (!hasAgentChatHost()) {
      if (!warned) console.error('[agent-chat] no host registered: call setAgentChatHost() in a server plugin')
      warned = true
      return
    }
    const app = useAgentChat()
    if (!seeded) {
      seeded = true
      await seedDefaultAgent(app)
    }
    await app.chat.supervise()
  }
  const run = () => { tick().catch(err => console.error('[agent-chat] supervise failed', err)) }
  const first = setTimeout(run, 5_000)
  const timer = setInterval(run, SUPERVISE_EVERY_MS)
  nitroApp.hooks.hook('close', () => {
    clearTimeout(first)
    clearInterval(timer)
  })
})
