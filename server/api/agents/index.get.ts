import { publicAgent } from '../../../lib/serialize'

export default defineOwnerHandler(async () => (await useAgentChat().store.agents.list()).map(publicAgent))
