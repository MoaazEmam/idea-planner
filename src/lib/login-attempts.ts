import { and, count, eq, gte, lt } from "drizzle-orm";
import { getDb } from "@/db/client";
import { loginAttempts } from "@/db/schema";

/**
 * Fixed-window brute-force guard for the single passphrase. Serverless
 * invocations share no memory, so attempts are counted in Postgres by client IP.
 * Five failures in fifteen minutes locks the IP out until the window rolls or a
 * successful login clears it.
 */
const WINDOW_MINUTES = 15;
const MAX_FAILURES = 5;
const PRUNE_HOURS = 24;

/** Vercel sets `x-forwarded-for`; the left-most entry is the client. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) {
    return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function isLoginLocked(ip: string): Promise<boolean> {
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
}

export async function recordLoginAttempt(
  ip: string,
  successful: boolean,
): Promise<void> {
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
}

export const LOGIN_MAX_FAILURES = MAX_FAILURES;
export const LOGIN_WINDOW_MINUTES = WINDOW_MINUTES;
