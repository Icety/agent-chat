import { buildChatAttention } from '../../../lib/attention'

export default defineOwnerHandler(async () => {
  const { store, sessions } = useAgentChat()
  return buildChatAttention({ store, running: await sessions.listRunning(), now: new Date() })
})
