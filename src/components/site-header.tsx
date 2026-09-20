import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b border-neutral-800">
      <div className="mx-auto flex w-full max-w-2xl items-center justify-between px-5 py-4">
        <Link href="/" className="text-sm font-semibold text-neutral-100">
          Idea Inbox
        </Link>
        <nav className="flex items-center gap-5 text-sm text-neutral-400">
          <Link href="/" className="transition hover:text-neutral-100">
            Inbox
          </Link>
          <Link href="/projects" className="transition hover:text-neutral-100">
            Projects
          </Link>
          <Link href="/runs" className="transition hover:text-neutral-100">
            Runs
          </Link>
          <form action="/api/logout" method="post">
            <button
              type="submit"
              className="transition hover:text-neutral-100"
            >
              Log out
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}
