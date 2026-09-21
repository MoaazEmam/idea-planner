import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b border-neutral-800">
      <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-5 py-2">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center text-sm font-semibold text-neutral-100"
        >
          Idea Inbox
        </Link>
        <nav className="flex items-center gap-1 text-sm text-neutral-400 sm:gap-3">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center px-2 transition hover:text-neutral-100"
          >
            Inbox
          </Link>
          <Link
            href="/projects"
            className="inline-flex min-h-11 items-center px-2 transition hover:text-neutral-100"
          >
            Projects
          </Link>
          <Link
            href="/runs"
            className="inline-flex min-h-11 items-center px-2 transition hover:text-neutral-100"
          >
            Runs
          </Link>
          <form action="/api/logout" method="post">
            <button
              type="submit"
              className="inline-flex min-h-11 items-center px-2 transition hover:text-neutral-100"
            >
              Log out
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}
