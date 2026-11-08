// A minimal host: the layer, Nuxt UI, a SQLite store in .data and an open owner check.
// Used for typecheck and build; run it with `bun run dev` to try the chat locally.
export default defineNuxtConfig({
  extends: ['..'],
  modules: ['@nuxt/ui'],
  ssr: false,
  css: ['~/assets/main.css'],
  devtools: { enabled: false },
  compatibilityDate: '2026-11-01',
  nitro: { preset: 'bun' },
})
