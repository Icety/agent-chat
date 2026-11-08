export default defineOwnerHandler(async event => {
  await useAgentChat().sessions.stop(getRouterParam(event, 'id') ?? '')
  return { ok: true }
})
