import { z } from 'zod'
import { publicAgent } from '../../../lib/serialize'

const isJson = (v: string | null | undefined): boolean => {
  if (v == null || v === '') return true
  try { JSON.parse(v); return true }
  catch { return false }
}

const schema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  alwaysOn: z.boolean().optional(),
  extraArgs: z.string().trim().max(500).nullable().optional(),
  settings: z.string().trim().max(5000).nullable().optional().refine(isJson, 'settings must be JSON'),
})

export default defineOwnerHandler(async event => {
  const id = getRouterParam(event, 'id') ?? ''
  const patch = await readValidatedBody(event, schema.parse)
  const { store, sessions } = useAgentChat()
  if (!(await store.agents.get(id))) throw createError({ statusCode: 404, statusMessage: 'Agent not found' })
  await store.agents.update(id, patch)
  // New arguments only apply to newly started sessions; stop running ones of this agent.
  if (patch.extraArgs !== undefined || patch.settings !== undefined) {
    const running = await sessions.listRunning()
    for (const c of (await store.conversations.list({ includeArchived: true })).filter(c => c.agentId === id && running.includes(c.id))) {
      await sessions.stop(c.id)
    }
  }
  const agent = await store.agents.get(id)
  return agent ? publicAgent(agent) : null
})
