import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  hasValidIngestToken,
  hasValidWorkerToken,
  verifySessionToken,
} from "@/lib/auth";

/**
 * Next.js 16 replaced `middleware.ts` with `proxy.ts`. It runs in the Node.js
 * runtime and is our single choke point for both page and API auth.
 */
const PUBLIC_PATHNAMES = new Set(["/login", "/api/login", "/api/health"]);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHNAMES.has(pathname)) {
    if (pathname === "/login") {
      const authed = await verifySessionToken(
        request.cookies.get(SESSION_COOKIE)?.value,
      );
      if (authed) {
        return NextResponse.redirect(new URL("/", request.url));
      }
    }
    return NextResponse.next();
  }

  // Machine capture (Apple Shortcut): bearer token instead of a cookie.
  if (pathname === "/api/ideas" && hasValidIngestToken(request)) {
    return NextResponse.next();
  }

  // Nightly enrichment worker: bearer token instead of a cookie.
  if (pathname.startsWith("/api/process") && hasValidWorkerToken(request)) {
    return NextResponse.next();
  }

  const authed = await verifySessionToken(
    request.cookies.get(SESSION_COOKIE)?.value,
  );

  if (pathname.startsWith("/api/")) {
    if (authed) {
      return NextResponse.next();
    }
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!authed) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Everything except Next internals and static files in /public.
    "/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest|txt|xml)$).*)",
  ],
};
