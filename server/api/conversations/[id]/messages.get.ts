import { publicMessage } from '../../../../lib/serialize'

export default defineOwnerHandler(async event => {
  const id = getRouterParam(event, 'id') ?? ''
  const { before, limit } = getQuery(event)
  return (await useAgentChat().store.messages.list(id, {
    limit: Math.min(Number(limit) || 100, 500),
    before: typeof before === 'string' ? new Date(before) : undefined,
  })).map(publicMessage)
})
