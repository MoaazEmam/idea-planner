import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  createSessionToken,
  isValidPassphrase,
} from "@/lib/auth";

export async function POST(request: Request) {
  const form = await request.formData();
  const passphrase = form.get("passphrase");

  if (!isValidPassphrase(passphrase)) {
    return NextResponse.redirect(new URL("/login?error=1", request.url), 303);
  }

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
