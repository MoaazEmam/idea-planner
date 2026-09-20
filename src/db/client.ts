import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Database = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as {
  pgClient?: ReturnType<typeof postgres>;
  db?: Database;
};

/**
 * Lazily creates the database client so importing a module that uses the db
 * never throws at build time. Cached on globalThis so Next.js dev HMR and
 * serverless invocations reuse a single connection.
 *
 * `prepare: false` is required by Supabase's Supavisor pooler (transaction
 * mode), and `max: 1` keeps a single-user app well inside the pooler limits.
 */
export function getDb(): Database {
  if (globalForDb.db) {
    return globalForDb.db;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const client =
    globalForDb.pgClient ??
    postgres(connectionString, { prepare: false, max: 1 });

  const db = drizzle(client, { schema });

  globalForDb.pgClient = client;
  globalForDb.db = db;

  return db;
}
