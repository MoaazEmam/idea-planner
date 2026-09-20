# Project status

_Updated 2026-09-20 · `main` at `1708a97` · production: https://idea-planner-moaaz12.vercel.app_

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

Three production bugs were found and fixed along the way: trailing prose after
`json_object` output (`721903d`), thinking-mode responses exhausting
`max_tokens` and returning empty content (`dd7910a`), and timestamp-based
staleness false-positiving after a failed run (fixed in `dd7910a` with a stored
source hash).

## Verified

- `npm run build`, `typecheck`, `lint` clean; `npm test` → 37 passed.
- `npm run smoke` → 26/26 against production (auth, idempotent capture,
  dashboard, projects, idea edit/delete, self-cleanup).
- Production checks: `/runs`, `/trash`, inbox Trash link, the Sort control, the
  Re-analyze button, and `POST /api/ideas/[id]/link` validation (400 without a
  project).
- Database: 4 live ideas, 4 trashed (all yours), 1 project, no test residue.

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
3. Spinoffs currently get the project-context analysis; they may warrant market
   research like a standalone.
4. `paused` / `done` projects still attract routing (`listProjects` filters only
   archived).
5. Restore for projects (they are hard-deleted by design) if that changes.

### Reliability

6. Alert when a nightly run fails entirely, or when an idea exhausts its 3
   attempts (today only a badge and the `/runs` row tell you).
7. Cost/budget view — tokens and Tavily credits are recorded per run but never
   surfaced, and there is no spend guard.
8. Error monitoring (failures live only on idea/run rows).

### Security & hygiene

9. Login rate limiting / lockout (one shared passphrase, unlimited attempts).
10. Export/backup path (currently whatever Supabase provides).

## Accepted / deferred

- **Railway migration** — deferred unless Vercel/Supabase disappoints.
- **Cron DST drift** — `0 17 * * *` UTC is 19:00 winter / 20:00 summer in Cairo.
- **GitHub disables scheduled workflows** after 60 days of repo inactivity;
  `gh workflow run nightly.yml` always works.
- **60s function ceiling** — one idea per request keeps standalone (~25s) and
  linked (~17s) inside it, with modest headroom.
- **Single-user model** — one passphrase, no accounts.
