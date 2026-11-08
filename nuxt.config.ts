// agent-chat as a Nuxt layer: API routes, the supervision plugin, composables and components.
// The host adds @nuxt/ui, its auth and its pages, and registers itself with setAgentChatHost()
// (README, Host integration).
export default defineNuxtConfig({
  runtimeConfig: {
    public: {
      // NUXT_PUBLIC_VAPID_PUBLIC_KEY: web push (usePush). Empty: push is off.
      vapidPublicKey: '',
    },
  },
})
