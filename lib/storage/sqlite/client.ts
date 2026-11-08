import { Database } from 'bun:sqlite'
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { fileURLToPath } from 'node:url'
import * as schema from './schema'

export type ChatSqliteDb = BunSQLiteDatabase<typeof schema>

export const sqliteChatMigrations = fileURLToPath(new URL('./migrations', import.meta.url))

// Opens (and creates) the database and applies the chat migrations. They use drizzle's default
// migrations table, `__drizzle_migrations`, like Koopa always did, so an existing Koopa or Toadette
// database is recognised as up to date. A host whose bundler moves this file passes the folder.
export const openSqliteChatDb = (path: string, migrationsDir: string = sqliteChatMigrations): ChatSqliteDb => {
  const sqlite = new Database(path, { create: true })
  sqlite.exec('PRAGMA journal_mode = WAL;')
  sqlite.exec('PRAGMA foreign_keys = ON;')
  sqlite.exec('PRAGMA busy_timeout = 5000;')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: migrationsDir })
  return db
}
