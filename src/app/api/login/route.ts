import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  createSessionToken,
  isValidPassphrase,
} from "@/lib/auth";
import {
  clientIp,
  isLoginLocked,
  recordLoginAttempt,
} from "@/lib/login-attempts";

export async function POST(request: Request) {
  const ip = clientIp(request);

  if (await isLoginLocked(ip)) {
    return NextResponse.redirect(
      new URL("/login?error=locked", request.url),
      303,
    );
  }

  const form = await request.formData();
  const passphrase = form.get("passphrase");

  if (!isValidPassphrase(passphrase)) {
    await recordLoginAttempt(ip, false);
    return NextResponse.redirect(new URL("/login?error=1", request.url), 303);
  }

  await recordLoginAttempt(ip, true);

  const token = await createSessionToken();
  const response = NextResponse.redirect(new URL("/", request.url), 303);
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return response;
}
