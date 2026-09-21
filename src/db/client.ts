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
 * never throws at build time. Cached on globalThis so a warm serverless
 * invocation reuses one connection.
 *
 * `prepare: false` is required by Supabase's Supavisor pooler (transaction
 * mode), and `max: 1` keeps a single-user app well inside the pooler limits.
 *
 * A single shared connection is also a single point of failure: if one request
 * is killed mid-query (a lock storm, a Vercel function timeout), its backend can
 * be left waiting on a client that will never read the result, and every later
 * request queues behind it forever. The pooling options below bound that:
 * `idle_timeout` / `max_lifetime` recycle connections instead of holding a
 * wedged backend for the life of the instance, and `keep_alive` lets the TCP
 * layer notice a dead peer.
 *
 * The server-side guards (`statement_timeout`, `lock_timeout`,
 * `idle_in_transaction_session_timeout`) cannot be set here because Supavisor
 * strips connection startup parameters; they are set as role defaults instead:
 *
 *   alter role idea_app set statement_timeout = '15s';
 *   alter role idea_app set lock_timeout = '5s';
 *   alter role idea_app set idle_in_transaction_session_timeout = '15s';
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
    postgres(connectionString, {
      prepare: false,
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
      max_lifetime: 60,
      keep_alive: 30,
    });

  const db = drizzle(client, { schema });

  globalForDb.pgClient = client;
  globalForDb.db = db;

  return db;
}
