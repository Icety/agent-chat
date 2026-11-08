import { fileURLToPath } from 'node:url'

// The generated Postgres migrations. Hosts with their own drizzle-kit setup do not need these:
// they re-export ./schema and generate their own.
export const pgChatMigrations = fileURLToPath(new URL('./migrations', import.meta.url))
