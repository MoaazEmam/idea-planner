import { and, count, eq, gte, lt } from "drizzle-orm";
import { getDb } from "@/db/client";
import { loginAttempts } from "@/db/schema";

/**
 * Fixed-window brute-force guard for the single passphrase. Serverless
 * invocations share no memory, so attempts are counted in Postgres by client IP.
 * Five failures in fifteen minutes locks the IP out until the window rolls or a
 * successful login clears it.
 *
 * The guard must never be able to lock the owner out of their own app, so every
 * call to the database fails open: if the table is slow, unreachable, or throws,
 * login proceeds. A short budget keeps a stalled database from hanging the
 * request the way the pages do.
 */
const WINDOW_MINUTES = 15;
const MAX_FAILURES = 5;
const PRUNE_HOURS = 24;
const DB_BUDGET_MS = 2000;

/** Vercel sets `x-forwarded-for`; the left-most entry is the client. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) {
    return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * Runs `fn` with a hard time budget, returning `fallback` on timeout or error.
 * The timer is unref'd and cleared so it never keeps a serverless invocation
 * alive once the query settles.
 */
async function withBudget<T>(
  label: string,
  fn: () => Promise<T>,
  fallback: T,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fn(),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), DB_BUDGET_MS);
        timer.unref?.();
      }),
    ]);
  } catch (error) {
    console.error(`[login] rate-limit ${label} failed; failing open`, error);
    return fallback;
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export async function isLoginLocked(ip: string): Promise<boolean> {
  return withBudget(
    "check",
    async () => {
      const db = getDb();
      const since = new Date(Date.now() - WINDOW_MINUTES * 60_000);
      const [row] = await db
        .select({ value: count() })
        .from(loginAttempts)
        .where(
          and(
            eq(loginAttempts.ip, ip),
            eq(loginAttempts.successful, false),
            gte(loginAttempts.attemptedAt, since),
          ),
        );
      return (row?.value ?? 0) >= MAX_FAILURES;
    },
    false,
  );
}

export async function recordLoginAttempt(
  ip: string,
  successful: boolean,
): Promise<void> {
  await withBudget(
    "record",
    async () => {
      const db = getDb();

      if (successful) {
        // Success clears the window so a legitimate login is never held hostage.
        await db.delete(loginAttempts).where(eq(loginAttempts.ip, ip));
        await db.insert(loginAttempts).values({ ip, successful: true });
        return;
      }

      await db.insert(loginAttempts).values({ ip, successful: false });
      await db
        .delete(loginAttempts)
        .where(
          lt(
            loginAttempts.attemptedAt,
            new Date(Date.now() - PRUNE_HOURS * 60 * 60_000),
          ),
        );
    },
    undefined,
  );
}

export const LOGIN_MAX_FAILURES = MAX_FAILURES;
export const LOGIN_WINDOW_MINUTES = WINDOW_MINUTES;
