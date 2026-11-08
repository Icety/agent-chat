import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { openSqliteChatDb } from '../../../lib/storage/sqlite/client'
import { createSqliteChatStore } from '../../../lib/storage/sqlite/store'
import { agentChatDir } from '../../../lib/runtime'

// Local only: everyone is the owner. A real host checks its login here.
export default defineNitroPlugin(() => {
  const dataDir = resolve(process.cwd(), '.data')
  mkdirSync(dataDir, { recursive: true })
  setAgentChatHost({
    store: createSqliteChatStore(openSqliteChatDb(resolve(dataDir, 'chat.db'), agentChatDir('lib', 'storage', 'sqlite', 'migrations'))),
    dataDir,
    appName: 'Playground',
    ownerName: 'the owner',
    timeZone: 'Europe/Amsterdam',
    requireOwner: async () => {},
    sessions: { channelServer: 'playground-web', publicUrl: 'http://127.0.0.1:3000' },
  })
})
