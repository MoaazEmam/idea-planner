# Project status

_Updated 2026-09-21 · `main` at `1708a97` with phase 7 + wave 1 uncommitted · production: https://idea-planner-moaaz12.vercel.app_

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
| 7 | Mobile ergonomics: shared `components/button.ts`, 44px tap targets across every control | unreleased |
| — | Routing ignores paused/done projects (`listProjects({ activeOnly })`) | unreleased |
| — | Alerts: failed runs and attempt-exhausted ideas post to `ALERT_WEBHOOK_URL` | unreleased |
| — | `GET /api/export` full JSON backup + Download button on `/runs` | unreleased |
| — | Login rate limiting: 5 failures / 15 min per IP, `login_attempts` table | unreleased |

Three production bugs were found and fixed along the way: trailing prose after
`json_object` output (`721903d`), thinking-mode responses exhausting
`max_tokens` and returning empty content (`dd7910a`), and timestamp-based
staleness false-positiving after a failed run (fixed in `dd7910a` with a stored
source hash).

## Verified

- Phase 7 + wave 1, locally: `npm run build`, `typecheck`, and `lint` clean;
  `npm test` → 37 passed. Migration `0005_motionless_cammi` (the
  `login_attempts` table) applied to the production database and granted. Not
  yet smoke-tested or exercised against production.
- Before this change set: `npm run build`, `typecheck`, `lint` clean; `npm test` → 37 passed.
- `npm run smoke` → 26/26 against production (auth, idempotent capture,
  dashboard, projects, idea edit/delete, self-cleanup).
- Production checks: `/runs`, `/trash`, inbox Trash link, the Sort control, the
  Re-analyze button, and `POST /api/ideas/[id]/link` validation (400 without a
  project).
- Database: 4 live ideas, 4 trashed (all yours), 1 project, no test residue.

## Planned

New work agreed after the phase-6 close-out. Phase numbers continue the table
above; order is a proposal, not a commitment. Phase 7 (mobile ergonomics) and
wave 1 (`#4`, `#6`, `#9`, `#10` in the backlog) have since shipped — see the
table above.

### Phase 8 — Promote an idea to a project

Turn a captured idea (usually one that analysed as standalone) into a project,
carrying the analysis across instead of re-typing context:

- Action on the idea page opens a pre-filled project form (reuse
  `project-form.tsx`), so the user can edit before saving.
- `name` from the idea (editable); `one_liner` from the analysis `summary`;
  `context` assembled from the raw text plus the standalone analysis
  (`summary`, `market_landscape`, `existing_solutions`, `suggested_features`,
  `risks`, `next_step`).
- The originating idea is then linked to the new project as a `spinoff`, so the
  project page shows its origin.
- One transactional endpoint (`POST /api/ideas/[id]/promote`) creates the
  project and the link together — never a project without its origin.
- Linked-analysis ideas can promote too, using `implementation`, `risks`, and
  `open_questions` for the context block.

### Phase 9 — Iterative ideas (design, not settled)

Goal: capture the idea once, then attach later clarifications or additions
after reading the analysis, without it becoming a chat thread. Proposal:

- **Append-only additions**: a short list of timestamped notes on the idea. No
  replies, no authorship, no thread state. A new `idea_additions` table (or a
  jsonb array on `ideas`) keeps them separate from `raw_text`, so the original
  capture is never rewritten.
- Adding one marks the analysis stale (fold additions into the stored source
  hash) and re-analysis feeds them to the model as a "Later clarifications"
  block. Re-analysis stays manual, matching the app's existing stance.
- UI: a compact "Add a thought" box plus the list, below the idea text.

Explicitly **not** in scope: threaded comments, replies, multiple authors,
auto-re-analysis.

### Packaging (content, phase-independent)

Copy for listing Idea Inbox itself as a project on the portfolio site, shaped to
fit the app's own `projects.one_liner` (≤300) and `projects.context` (≤20000)
fields should it also be seeded here.

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
4. Restore for projects (they are hard-deleted by design) if that changes.

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
  linked (~17s) inside it, with modest headroom.
- **Single-user model** — one passphrase, no accounts.
