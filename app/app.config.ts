// Client config of agent-chat. A host overrides any of these in its own app/app.config.ts.
export interface AgentChatAppConfig {
  // "Message Koopa", "Close Koopa completely": the app's name.
  appName: string
  // IANA zone every time is shown in.
  timeZone: string
  // A conversation lives at `${conversationPath}${id}`.
  conversationPath: string
  // Where the thread goes after archiving, and its Back button without history.
  chatsPath: string
  // Where the "Claude is not logged in" banner links (empty: no link).
  settingsPath: string
  // The command that opens claude on the server, shown in the login help (empty: generic text).
  claudeLogin: string
}

declare module 'nuxt/schema' {
  interface AppConfigInput {
    agentChat?: Partial<AgentChatAppConfig>
  }
  interface AppConfig {
    agentChat: AgentChatAppConfig
  }
}

export default defineAppConfig({
  agentChat: {
    appName: 'Chat',
    timeZone: 'UTC',
    conversationPath: '/c/',
    chatsPath: '/chats',
    settingsPath: '/settings',
    claudeLogin: '',
  } satisfies AgentChatAppConfig,
})
