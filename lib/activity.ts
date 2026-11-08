const basename = (path: unknown): string =>
  typeof path === 'string' ? (path.split('/').filter(Boolean).at(-1) ?? path) : 'a file'

const truncate = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max)}…` : text

const host = (url: unknown): string => {
  if (typeof url !== 'string') return 'a web page'
  try {
    return new URL(url).host
  }
  catch {
    return 'a web page'
  }
}

// What the assistant is doing, in plain words, for the "working" indicator.
// Returns null for tools that should not show up (the chat's own reply tools).
// `channelServer`: the chat's own channel (its reply tool is not activity).
export const describeTool = (toolName: string, input: Record<string, unknown>, channelServer = ''): string | null => {
  if (channelServer && toolName.includes(channelServer)) return null
  switch (toolName) {
    case 'Read': return `Reading ${basename(input.file_path)}`
    case 'Edit':
    case 'MultiEdit':
    case 'Write': return `Editing ${basename(input.file_path)}`
    case 'Bash': return `Running ${truncate(String(input.command ?? ''), 40)}`
    case 'Grep':
    case 'Glob': return 'Searching files'
    case 'WebSearch': return 'Searching the web'
    case 'WebFetch': return `Reading ${host(input.url)}`
    case 'Task':
    case 'Agent': return 'Delegating to a helper'
    case 'TodoWrite': return 'Planning'
  }
  if (toolName.startsWith('mcp__')) {
    const server = toolName.split('__')[1] ?? 'a tool'
    return `Using ${server.replace(/^plugin_/, '').split('_')[0]}`
  }
  return `Using ${toolName}`
}
