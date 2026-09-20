import { createHash, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "idea_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

type SecretName =
  | "SESSION_SECRET"
  | "DASHBOARD_PASSPHRASE"
  | "INGEST_TOKEN"
  | "WORKER_TOKEN";

function requiredSecret(name: SecretName): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

/** Hash both sides first so differing lengths never leak via timingSafeEqual. */
function safeEqual(a: string, b: string): boolean {
  const digestA = createHash("sha256").update(a).digest();
  const digestB = createHash("sha256").update(b).digest();
  return timingSafeEqual(digestA, digestB);
}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(requiredSecret("SESSION_SECRET"));
}

export async function createSessionToken(): Promise<string> {
  return new SignJWT({ role: "owner" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setSubject("owner")
    .setExpirationTime("30d")
    .sign(secretKey());
}

export async function verifySessionToken(
  token: string | undefined | null,
): Promise<boolean> {
  if (!token) {
    return false;
  }
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: ["HS256"],
    });
    return payload.sub === "owner";
  } catch {
    return false;
  }
}

export function isValidPassphrase(input: unknown): boolean {
  return (
    typeof input === "string" &&
    input.length > 0 &&
    safeEqual(input, requiredSecret("DASHBOARD_PASSPHRASE"))
  );
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header || !header.startsWith("Bearer ")) {
    return null;
  }
  return header.slice("Bearer ".length).trim();
}

function tokenMatches(candidate: string | null, expected: string): boolean {
  return candidate !== null && candidate.length > 0 && safeEqual(candidate, expected);
}

/** Apple Shortcut and any other machine capture client. */
export function hasValidIngestToken(request: Request): boolean {
  return tokenMatches(bearerToken(request), requiredSecret("INGEST_TOKEN"));
}

/** Nightly enrichment worker (Phase 3+). */
export function hasValidWorkerToken(request: Request): boolean {
  return tokenMatches(bearerToken(request), requiredSecret("WORKER_TOKEN"));
}
