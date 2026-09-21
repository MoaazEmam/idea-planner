import type { Metadata } from "next";
import { BUTTON_BLOCK } from "@/components/button";

export const metadata: Metadata = {
  title: "Sign in · Idea Inbox",
};

const ERROR_MESSAGES: Record<string, string> = {
  "1": "Incorrect passphrase.",
  locked: "Too many attempts. Try again in a few minutes.",
};

export default async function LoginPage(props: PageProps<"/login">) {
  const { error } = await props.searchParams;
  const message =
    typeof error === "string" ? ERROR_MESSAGES[error] ?? null : null;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-neutral-950 px-6 text-neutral-100">
      <form
        action="/api/login"
        method="post"
        className="w-full max-w-sm space-y-5 rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-xl"
      >
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Idea Inbox</h1>
          <p className="text-sm text-neutral-400">
            Enter your passphrase to continue.
          </p>
        </div>

        <input
          type="password"
          name="passphrase"
          autoFocus
          autoComplete="current-password"
          placeholder="Passphrase"
          className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-base outline-none focus:border-neutral-500"
        />

        {message ? (
          <p className="text-sm text-red-400">{message}</p>
        ) : null}

        <button type="submit" className={BUTTON_BLOCK}>
          Sign in
        </button>
      </form>
    </main>
  );
}
