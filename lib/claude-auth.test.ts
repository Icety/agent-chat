import { describe, expect, test } from 'bun:test'
import { checkClaudeAuth } from './claude-auth'
import type { Exec } from './sessions'

const execReturning = (code: number, stdout: string): Exec => async () => ({ code, stdout, stderr: '' })

describe('claude auth status', () => {
  test('logged in with a subscription', async () => {
    const out = '{"loggedIn":true,"authMethod":"claude.ai","subscriptionType":"max"}'
    expect(await checkClaudeAuth(execReturning(0, out), 'claude')).toEqual({ loggedIn: true, method: 'claude.ai' })
  })

  test('not logged in (claude exits 1 but still prints json)', async () => {
    expect(await checkClaudeAuth(execReturning(1, '{"loggedIn":false,"authMethod":"none"}'), 'claude'))
      .toEqual({ loggedIn: false, method: 'none' })
  })

  test('unknown when claude is missing or prints garbage', async () => {
    expect(await checkClaudeAuth(execReturning(127, ''), 'claude')).toEqual({ loggedIn: null, method: null })
    expect(await checkClaudeAuth(async () => { throw new Error('ENOENT') }, 'claude')).toEqual({ loggedIn: null, method: null })
  })
})
