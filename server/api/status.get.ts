import type { Status } from '../../shared/types'

export default defineOwnerHandler(async (): Promise<Status> => {
  const app = useAgentChat()
  const [claudeVersion, auth, runningConversations, devices] = await Promise.all([
    app.claudeVersion(), app.claudeAuth(), app.sessions.listRunning(), app.store.push.list(),
  ])
  return {
    claudeVersion,
    claudeLoggedIn: auth.loggedIn,
    runningConversations,
    pushEnabled: app.pushEnabled,
    pushDevices: devices.length,
    voiceEnabled: app.voiceEnabled,
  }
})
