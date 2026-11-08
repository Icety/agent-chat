export default defineOwnerHandler(async () => {
  const { push, pushEnabled, config } = useAgentChat()
  if (!pushEnabled) throw createError({ statusCode: 400, statusMessage: 'Push is not configured on the server (VAPID keys)' })
  await push({ title: config.appName, body: 'Notifications work.', url: '/' })
  return { ok: true }
})
