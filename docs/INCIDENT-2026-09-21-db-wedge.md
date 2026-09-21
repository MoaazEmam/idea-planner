# Incident: Postgres connection wedge (2026-09-21)

**Status:** resolved. Root cause identified and fixed in `src/db/client.ts`;
the fix is verified locally and deployed to production.
**Impact:** the whole app was unusable (every DB-backed page and API route hung,
then 504'd after 300s) while `/api/health` stayed fast.
**Affected deployments:** `468a937`, `6039477`, `f4f4b3c`, `b2845aa`
(phases 7-9 + wave 1 + wave 2). Unaffected: `bb5691a` and earlier.

## TL;DR

A single Supabase pooler backend could be left parked in `ClientRead` (the query
finished, the client never read the result, usually because the HTTP request was
aborted or the function was killed). Because the app shares **one** connection
per process (`max: 1`), every later request on that process queued behind the
stuck one forever. It looked like "the database is down", but the database was
healthy the whole time.

## Symptoms

- Authenticated DB pages (`/`, `/projects`, `/runs`, `/trash`, `/ideas/[id]`,
  `/api/export`) hang; `/api/health` (no DB) and `/login` proxy checks are fast.
- Requests eventually fail at Vercel's 300s function limit (504) or after the
  120s DB `statement_timeout` (`57014`).
- Killing the stuck backend restores the app instantly.
- Not reproducible through `tsx` (short-lived process, connection per run) — it
  reproduced under `next start` / Vercel (long-lived process reusing a cached
  client).

## Evidence

- Runtime logs: all failures on the `idea_app` connection via Supavisor.
- `pg_stat_activity` during a hang showed exactly one `idea_app` backend:
  `state=active`, `wait_event_type=Client`, `wait_event=ClientRead`, age minutes,
  holding a query (once the inbox `select ... from ideas`, once
  `select ... from idea_additions`).
- `pg_locks`: 0 ungranted, 0 AccessExclusive. No idle-in-transaction. DB
  `ACTIVE_HEALTHY`.
- Direct queries (Supabase MCP, dashboards) were instant throughout.
- Controlled comparison: the old deployment URL was fast while the current one
  hung, same database, same env vars, same region → not infra, not the queries.
- Trivial queries timed out (e.g. `select count(*)` on an empty table), proving
  it was not query cost.

## Root cause

`src/db/client.ts` caches a `postgres()` client on `globalThis` with `max: 1`.
In a warm serverless instance that one connection is reused for every request.
If a request is torn down while its query result is still in flight (client
navigates away / RSC prefetch cancelled / function killed mid-query), the backend
is left waiting for a client that will never read, and the cached connection is
permanently unusable. Every subsequent query on that instance queues behind it.

The lock storm from running `db:migrate` + `db:grant` against live traffic made
this much more likely: queries waited up to 120s, functions were killed at 300s
mid-query, and that is exactly how a backend gets orphaned.

## Why the first hardening did not fix it

`b2845aa` added role-level `statement_timeout=15s`, `lock_timeout=5s`,
`idle_in_transaction_session_timeout=15s` and client `idle_timeout` /
`max_lifetime` / `keep_alive`. Those help lock storms and recycle **idle**
connections, but they do **not** touch a backend wedged in `ClientRead` (the
query already executed, so `statement_timeout` is not counting), and a wedged
connection is not "idle" so `idle_timeout` does not retire it.

(Side note: Supavisor **strips connection startup parameters**, so
`postgres({ connection: { statement_timeout } })` is silently ignored; the
role-level `ALTER ROLE ... SET` form is the one that actually applies.)

## What was applied, and where it lives

| Change | Commit | Live in prod now? |
|---|---|---|
| Login rate limiting fails open (2s budget) | `6039477` | **No** (rolled back) |
| Role timeouts on `idea_app` | DB, not code | **Yes** (harmless) |
| Client recycling options | `b2845aa` | **No** (rolled back) |
| Wave 1 (mobile, alerts, export, #4 routing) | `468a937` | **No** |
| Wave 2 (promote, additions, spinoff research) | `468a937` | **No** |

Migrations `0005` (`login_attempts`) and `0006` (`idea_additions`) **are
applied** to production; they are additive and ignored by the old code that is
currently deployed.

## Current state (as of writing)

- **Production:** `idea-planner-moaaz12.vercel.app` serves a fresh redeploy of
  `bb5691a` (pre-change). Verified: `/`, `/projects`, `/runs`, `/trash` → 200.
  **The new features are not live.**
- **Repository:** `main` is at `b2845aa` (all new code + hardening), which is
  **not currently production-safe**. Working tree also has an **uncommitted**
  rewrite of `src/app/api/export/route.ts` (sequential queries, plain `Response`,
  `force-dynamic`) that is untested — `/api/export` was a reliable wedge trigger.
- **Database:** healthy, new tables present, role timeouts set.

## Resolution

The wedge needed two properties to become an outage, and both are now gone.

**1. `max: 1` made one wedged backend a total outage.** The pool is now
`max: 5`, so a wedge degrades throughput instead of stopping the app.

**2. A wedged connection could never be replaced.** This is the part the first
hardening got wrong, and reading postgres.js confirms why. Both `idle_timeout`
and `max_lifetime` are wired to the per-connection `end()`
(`node_modules/postgres/src/connection.js:75-76`), and `end()` refuses to
terminate a socket that still has an in-flight query:

```js
!connection.reserved && !initial && !query && sent.length === 0
  ? (terminate(), ...)                      // only when nothing is in flight
  : ending = new Promise(r => ended = r)    // otherwise: waits forever
```

So `max_lifetime: 60` did not recycle the wedged connection — it marked it
`ending` permanently, which is strictly worse. It has been removed.

The recovery path is `resetDb()`, which calls `end({ timeout: 0 })`. The
top-level `end()` (`src/index.js:365-389`) races the graceful close against
`destroy()`, which calls `terminate()` regardless of in-flight work. That is the
one client-side operation that frees a wedged backend.

`getDb()` now returns a drizzle instance over a proxied client that bounds every
query at 20s (above the 15s role `statement_timeout`, so a merely slow query
still fails as `57014` rather than tripping a reset). On timeout it cancels the
query, force-discards the pool, and the next call builds a fresh one. A
`generation` counter keeps concurrent timeouts from tearing down the pool more
than once.

### What was rejected, and why

A per-request connection scoped with React `cache()` plus `after()` was the
first design, and it was tested before being discarded. `cache()` **does not
deduplicate in Route Handlers** — an instrumented probe calling `getDb()` three
times in one request created three separate clients. With 36 call sites that
would have opened dozens of connections per request and exhausted Supavisor. The
pooled, self-healing client is what shipped instead.

### Verified

- Every drizzle path works through the proxy: raw `execute`, selects, joins,
  `insert ... returning`, `delete`, and transactions (`client.begin`).
- With the bound temporarily lowered to 2s, `select pg_sleep(10)` aborted after
  2.8s, the next request succeeded, and `pg_stat_activity` showed the backend
  gone rather than parked.
- `typecheck`, `lint`, 48 tests, and `next build` all pass; `next start` serves
  `/api/health` and `/login`, and `/api/export` is dynamic (`ƒ`).

Note for local work: `getDb()` caches on `globalThis`, which **survives HMR**.
After editing `src/db/client.ts`, restart `next dev` or you will keep using the
previously built client.

## Ops runbook

Recover a wedged app immediately by terminating the parked backend(s):

```sql
select pid, pg_terminate_backend(pid)
from pg_stat_activity
where usename = 'idea_app'
  and state = 'active'
  and wait_event = 'ClientRead'
  and now() - query_start > interval '5 seconds';
```

Then confirm with `/api/health` (fast) and an authenticated page. If function
instances stay stuck after the DB is free, redeploy (a fresh deployment gets
fresh instances) or let them age out.

**Never run `db:migrate` / `db:grant` against live traffic.** Those statements
take table-wide locks and are what started the cascade.

## Loose ends

- `NEXT_PUBLIC_APP_URL` is still set in Vercel but unused.
- The `db:grant` script emits `01007` ("no privileges were granted"). This was
  checked against the live database and is benign: `idea_app` holds
  SELECT/INSERT/UPDATE/DELETE on all five tables, so `01007` just means the
  grants were already in place and the statement was a no-op.
