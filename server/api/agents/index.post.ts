import { z } from 'zod'
import { existsSync } from 'node:fs'
import { publicAgent } from '../../../lib/serialize'

const schema = z.object({
  name: z.string().trim().min(1).max(60),
  cwd: z.string().trim().startsWith('/'),
  alwaysOn: z.boolean().default(false),
})

export default defineOwnerHandler(async event => {
  const input = await readValidatedBody(event, schema.parse)
  if (!existsSync(input.cwd)) {
    throw createError({ statusCode: 400, statusMessage: `Folder ${input.cwd} does not exist on the server` })
  }
  return publicAgent(await useAgentChat().store.agents.create(input))
})
