import type { Exec } from './sessions'

export interface ClaudeAuth {
  loggedIn: boolean | null
  method: string | null
}

// `claude auth status` prints JSON and exits 1 when logged out. null = could not tell.
export const checkClaudeAuth = async (exec: Exec, claudeBin: string): Promise<ClaudeAuth> => {
  try {
    const result = await exec([claudeBin, 'auth', 'status', '--json'])
    const parsed = JSON.parse(result.stdout) as { loggedIn?: unknown, authMethod?: unknown }
    if (typeof parsed.loggedIn !== 'boolean') return { loggedIn: null, method: null }
    return { loggedIn: parsed.loggedIn, method: typeof parsed.authMethod === 'string' ? parsed.authMethod : null }
  }
  catch {
    return { loggedIn: null, method: null }
  }
}
