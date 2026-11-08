import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './lib/storage/pg/schema.ts',
  out: './lib/storage/pg/migrations',
})
