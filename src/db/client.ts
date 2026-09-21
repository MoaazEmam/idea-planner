import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Database = PostgresJsDatabase<typeof schema>;
type Client = ReturnType<typeof postgres>;

const globalForDb = globalThis as unknown as {
  pgClient?: Client;
  db?: Database;
  dbGeneration?: number;
};

/**
 * A query that has not settled in this long means the connection carrying it is
 * presumed wedged. It must sit above the role-level `statement_timeout` (15s),
 * so a merely slow query fails as `57014` rather than tripping a pool reset.
 */
const QUERY_TIMEOUT_MS = 20_000;

/** Slots in the pool. See the note on `max` below. */
const POOL_SIZE = 5;

/**
 * The 2026-09-21 outage: the app shared one `postgres()` client with `max: 1`,
 * cached on `globalThis`. A warm serverless instance reused that single
 * connection for every request, so when a request was torn down mid-query
 * (client navigated away, RSC prefetch cancelled, function killed at the
 * platform limit) the backend was left parked in `ClientRead` and every later
 * request on that instance queued behind it forever. `/api/health` has no DB
 * work, so the platform kept reporting the deployment healthy.
 *
 * Two properties caused the outage, and both are fixed here:
 *
 * 1. `max: 1` made one wedged backend a total outage. `POOL_SIZE` slots mean a
 *    wedge degrades throughput instead of stopping the app.
 * 2. A wedged connection could never be replaced. `idle_timeout` and
 *    `max_lifetime` cannot do it: both are wired to postgres.js's per-connection
 *    `end()`, which refuses to terminate a socket that still has an in-flight
 *    query and instead marks the connection `ending` permanently. `max_lifetime`
 *    is therefore actively harmful here and is deliberately not set.
 *
 * The recovery path is `resetDb()`, which calls `end({ timeout: 0 })`. That
 * races the graceful close against postgres.js's `destroy()`, which calls
 * `terminate()` and kills the socket regardless of in-flight work — the one
 * client-side operation that frees a wedged backend. Closing the socket lets
 * Postgres reap the backend, so the app self-heals instead of needing the
 * manual `pg_terminate_backend` runbook.
 *
 * `prepare: false` is required by Supavisor in transaction mode. The server-side
 * guards cannot be passed here because Supavisor strips connection startup
 * parameters; they are role defaults instead:
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

  const client = postgres(connectionString, {
    prepare: false,
    max: POOL_SIZE,
    connect_timeout: 10,
    idle_timeout: 20,
    keep_alive: 30,
  });

  globalForDb.pgClient = client;
  globalForDb.dbGeneration = (globalForDb.dbGeneration ?? 0) + 1;
  globalForDb.db = drizzle(watch(client, globalForDb.dbGeneration), { schema });

  return globalForDb.db;
}

/**
 * Force-discards the pooled client so the next `getDb()` builds a fresh one.
 * `generation` makes this idempotent: several queries usually time out together
 * on a wedged pool, and only the first should tear it down.
 */
export async function resetDb(generation?: number): Promise<void> {
  if (generation !== undefined && generation !== globalForDb.dbGeneration) {
    return;
  }

  const client = globalForDb.pgClient;
  globalForDb.pgClient = undefined;
  globalForDb.db = undefined;

  if (!client) return;
  try {
    // timeout 0 => immediate terminate(), which a wedged socket cannot refuse.
    await client.end({ timeout: 0 });
  } catch {
    // The client is being discarded; a failure to close it changes nothing.
  }
}

/**
 * Wraps the postgres.js client so every query drizzle issues is bounded.
 *
 * drizzle's postgres-js driver only ever reaches the wire through
 * `client.unsafe(query, params)`, optionally chaining `.values()`. Both are
 * preserved here; everything else passes straight through.
 */
function watch(client: Client, generation: number): Client {
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop !== "unsafe") {
        const value = Reflect.get(target, prop, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      }
      return (...args: unknown[]) =>
        bound(
          (target.unsafe as (...a: unknown[]) => object)(...args),
          generation,
        );
    },
  });
}

function bound<T extends object>(query: T, generation: number): T {
  return new Proxy(query, {
    get(target, prop, receiver) {
      // `.values()` / `.raw()` return another pending query; keep it bounded.
      if (prop === "values" || prop === "raw") {
        const method = Reflect.get(target, prop, receiver) as (
          ...a: unknown[]
        ) => object;
        return (...args: unknown[]) =>
          bound(method.apply(target, args), generation);
      }

      if (prop === "then") {
        return (
          onFulfilled?: (value: unknown) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) => race(target, generation).then(onFulfilled, onRejected);
      }

      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

function race(query: object, generation: number): Promise<unknown> {
  const settled = new Promise((resolve, reject) => {
    // The target's own `then`, so this does not re-enter the proxy.
    (query as PromiseLike<unknown>).then(resolve, reject);
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(
        `Database query exceeded ${QUERY_TIMEOUT_MS}ms; recycling the connection pool`,
      );
      // Ask the server to abandon it, then discard the pool either way.
      try {
        (query as { cancel?: () => void }).cancel?.();
      } catch {
        // Best effort: the reset below is what actually frees the backend.
      }
      void resetDb(generation);
      reject(error);
    }, QUERY_TIMEOUT_MS);
  });

  return Promise.race([settled, timeout]).finally(() => clearTimeout(timer));
}
