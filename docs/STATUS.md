# Project status

_Updated 2026-09-21 · production: https://idea-planner-moaaz12.vercel.app_

> **Production incident 2026-09-21 (resolved):** the DB-backed app hung while
> the database stayed healthy. A single shared connection (`max: 1`, cached on
> `globalThis`) could be left wedged in `ClientRead`, and every later request on
> that instance queued behind it. The connection pool is now bounded and
> self-healing; root cause, evidence, and the fix are in
> [`INCIDENT-2026-09-21-db-wedge.md`](INCIDENT-2026-09-21-db-wedge.md).


A snapshot of what is shipped, what is verified, and what is left. Setup,
architecture, and the env reference live in the [`README`](../README.md).

Phase numbers below are ours (the original plan document is not in the repo);
they reflect the order the work actually landed.

## Shipped

| Phase | What | Commits |
|---|---|---|
| 1 | Capture: Next.js + Supabase/Drizzle schema, session auth, Apple Shortcut ingest, PWA | scaffold … `cfc647b` |
| 2 | Projects + idea management: projects CRUD, edit/soft-delete, project delete | `7475809` … `2c8eecb` |
| 3 | Routing: enrichment schema, DeepSeek seam, `/api/process`, nightly GitHub Actions cron | `8e8f014` … `076433c` |
| 4 | Standalone enrichment: Tavily research, scored analysis, sources | `be90a9b` |
| 5 | Project-linked analysis grounded in project context | `a67f86a` |
| 6 | Run visibility: inbox banner, `/runs`, plus manual re-analyze + staleness | `0a72a73` |
| — | Vitest + unit tests for the pure logic | `51311f8` |
| — | Unsorted triage: sort an idea by hand (project / standalone / unsorted) | `9fdf6c5` |
| — | Deletion integrity: unlink ideas on project delete, Trash + restore | `22cc27e` |
| — | Cleanup: `MAX_IDEAS_PER_RUN` enforced, run errors recorded, dead columns dropped, README | `1708a97` |
| 7 | Mobile ergonomics: shared `components/button.ts`, 44px tap targets across every control | `468a937` |
| — | Routing ignores paused/done projects (`listProjects({ activeOnly })`) | `468a937` |
| — | Alerts: failed runs and attempt-exhausted ideas post to `ALERT_WEBHOOK_URL` | `468a937` |
| — | `GET /api/export` full JSON backup + Download button on `/runs` | `468a937` |
| — | Login rate limiting: 5 failures / 15 min per IP, `login_attempts` table | `468a937` |
| 8 | Promote an idea to a project, carrying the analysis into project context | `468a937` |
| 9 | Iterative ideas: append-only additions folded into the analysis + source hash | `468a937` |
| — | Spinoffs run standalone market research alongside the fit analysis | `468a937` |
| 10 | Personal-tool lens: standalone build-vs-buy analysis, on-demand tab, `/api/ideas/[id]/personal-analysis` | `b78ef15` … `fe0d03e` |

Three production bugs were found and fixed along the way: trailing prose after
`json_object` output (`721903d`), thinking-mode responses exhausting
`max_tokens` and returning empty content (`dd7910a`), and timestamp-based
staleness false-positiving after a failed run (fixed in `dd7910a` with a stored
source hash).

## Verified

- Personal-tool lens (phase 10): `npm run build`, `typecheck`, and `lint` clean;
  `npm test` → 63 passed (schema v1-blob back-compat, the required personal
  block, the mocked `enrichStandalone` wiring, and a `react-dom/server` render
  test for the new view). Locally against `next dev`: the endpoint's auth gate
  (401), malformed id (404), and non-standalone rejection (422) all hold, and
  standalone idea pages server-render the new tabs. The paid research path was
  not exercised end-to-end.
- Phase 7 + wave 1 + wave 2, locally: `npm run build`, `typecheck`, and `lint`
  clean; `npm test` → 48 passed (new tests for the promote builder and
  additions-aware staleness). Migrations `0005` (`login_attempts`) and `0006`
  (`idea_additions`) applied to the production database and granted; both tables
  verified present.
- Deployed: `468a937` built READY on Vercel and aliased to production. Production
  smoke of the new surface: `/api/health` → 200, `/api/export` without a session
  → 401.
- Before this change set: `npm run build`, `typecheck`, `lint` clean; `npm test`
  → 37 passed.
- `npm run smoke` → 26/26 against production (auth, idempotent capture,
  dashboard, projects, idea edit/delete, self-cleanup).
- Database: 4 live ideas, 4 trashed (all yours), 1 project, no test residue.

## Planned

Everything agreed at the phase-6 close-out has now shipped (phases 7-9 and the
wave-1 hardening in `468a937`). What remains is content, not code.

### Packaging

Idea Inbox itself can be seeded as a project (the user will do this by hand);
the one-liner and context are in the session notes, shaped to fit
`projects.one_liner` (≤300) and `projects.context` (≤20000).

## Known issues

- **`npm run smoke` leaves ideas in Trash.** The API only soft-deletes, so each
  smoke run adds rows to `/trash` (they were purged by hand). Needs an
  empty-trash/hard-delete path, or a smoke-specific cleanup.
- **Stale analyses persist until you act.** Editing a description flags the
  analysis as out of date but nothing re-runs automatically (deliberate).
- **Unused Vercel variable.** `NEXT_PUBLIC_APP_URL` is read by nothing and was
  removed from `.env.example`, but it is still set in Vercel and the MCP tools
  cannot delete env vars — remove it from the dashboard.

## Backlog

### Functional

1. Search / filter / pagination for ideas (inbox caps at 100) and runs (50).
2. Bulk actions — re-analyze, delete, or re-sort many ideas at once.
3. Restore for projects (they are hard-deleted by design) if that changes.

### Reliability

5. Cost/budget view — tokens and Tavily credits are recorded per run but never
   surfaced, and there is no spend guard.
6. Error monitoring (failures live only on idea/run rows; a webhook alert now
   covers the actionable part).

## Accepted / deferred

- **Railway migration** — deferred unless Vercel/Supabase disappoints.
- **Cron DST drift** — `0 17 * * *` UTC is 19:00 winter / 20:00 summer in Cairo.
- **GitHub disables scheduled workflows** after 60 days of repo inactivity;
  `gh workflow run nightly.yml` always works.
- **60s function ceiling** — one idea per request keeps standalone (~25s) and
  linked (~17s) inside it, with modest headroom. Spinoffs run fit + research in
  parallel, so the pair costs roughly the slower half, not the sum.
- **Single-user model** — one passphrase, no accounts.
