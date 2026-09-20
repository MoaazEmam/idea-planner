import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in · Idea Inbox",
};

export default async function LoginPage(props: PageProps<"/login">) {
  const { error } = await props.searchParams;
  const hasError = error === "1";

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
          className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-base outline-none focus:border-neutral-500"
        />

        {hasError ? (
          <p className="text-sm text-red-400">Incorrect passphrase.</p>
        ) : null}

        <button
          type="submit"
          className="w-full rounded-lg bg-neutral-100 px-3 py-2 font-medium text-neutral-900 transition hover:bg-white"
        >
          Sign in
        </button>
      </form>
    </main>
  );
}
