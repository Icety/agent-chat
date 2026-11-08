import { defineConfig } from 'drizzle-kit'

// Never edit existing migrations: Koopa's live database tracks them by hash and time.
export default defineConfig({
  dialect: 'sqlite',
  schema: './lib/storage/sqlite/schema.ts',
  out: './lib/storage/sqlite/migrations',
})
