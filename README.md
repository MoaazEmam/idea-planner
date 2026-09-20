# Idea Inbox

A personal idea capture tool with a nightly LLM pipeline. Type or dictate an
idea from your phone, come back to a sorted inbox where each idea is either
linked to one of your projects with an implementation analysis, or researched as
a standalone product with scores and sources.

It is a single-user app: one shared passphrase, one database, no accounts.

> Shipped work, known issues, and the remaining backlog: [`docs/STATUS.md`](docs/STATUS.md).

## How it works

```
capture            route                 enrich
───────            ─────                 ──────
Apple Shortcut ─┐
web form ───────┼─► store ─► nightly ─► LLM picks a project ─┬─ linked   ─► project-context analysis
                                                                 └─ standalone ─► web research + scores
                └─► (unsorted) ─► you sort it by hand ─► one of the above
```

- **Capture** is fire-and-forget via `POST /api/ideas`, authenticated with an
  ingest token (Apple Shortcut) or a session cookie (web form). Capture keys make
  it idempotent, so a retried Shortcut never duplicates an idea.
- **Route + enrich** runs one idea per request from `POST /api/process`, which
  the nightly GitHub Actions workflow drives with a worker token. One idea per
  request keeps each invocation inside the 60s function limit.
- **Manual control** matters: sorting an unsorted idea, editing a description,
  and re-running an analysis are all user actions, not automatic ones.

### Idea lifecycle

`analysis_status` moves through:

| Status | Meaning | Claimable by the nightly run |
|---|---|---|
| `new` | Captured, never routed | yes |
| `processing` | Locked by a run in progress | no (until the 10-minute lock expires) |
| `routed` + project | Linked, awaiting/retrying analysis | yes |
| `routed` + no project | **Unsorted** — needs a human decision | no, sort it by hand |
| `enriched` | Analysis complete | no — re-run is explicit |
| `failed` | Last attempt failed | yes, until 3 attempts, then manual re-run |

Editing the text does not silently re-queue an idea. The idea page shows
"Edited since last analysis" (compared via a stored source hash) and a
**Re-analyze** button.

## Stack

Next.js 16 (App Router, Node runtime) · TypeScript strict · Tailwind v4 ·
Supabase Postgres + Drizzle ORM · DeepSeek (routing + analysis) · Tavily (web
research) · GitHub Actions cron · Vercel.

The two provider integrations are isolated behind seams so they can be swapped in
one file each: `src/lib/llm/client.ts` and `src/lib/research/tavily.ts`.

## Local setup

Prerequisites: Node 20+, a Supabase project (or any Postgres), and API keys for
DeepSeek and Tavily.

```bash
npm install
cp .env.example .env   # fill in the values (see below)
```

Migrations run as the app role over the **session** pooler (port 5432); the app
itself uses the **transaction** pooler (port 6543). After every migration the
`postgres` role needs grants, because the table owner is the app role:

```bash
npx drizzle-kit migrate   # DATABASE_URL on the session pooler
npm run db:grant          # lets the Supabase dashboard/MCP see the tables
npm run dev
```

In production those same steps are how schema changes are applied. `npm run
db:generate` creates a migration from `src/db/schema.ts`.

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection (transaction pooler, port 6543) |
| `INGEST_TOKEN` | yes | Bearer token for machine capture (`openssl rand -hex 32`) |
| `WORKER_TOKEN` | yes | Bearer token for the nightly worker |
| `SESSION_SECRET` | yes | Signs the dashboard session JWT (`openssl rand -hex 32`) |
| `DASHBOARD_PASSPHRASE` | yes | The one passphrase you type to sign in |
| `DEEPSEEK_API_KEY` | yes | Routing and analysis |
| `TAVILY_API_KEY` | for standalone ideas | Web research |
| `PROCESSING_ENABLED` | no | `false` makes `/api/process` a no-op (kill switch) |
| `LINK_CONFIDENCE_THRESHOLD` | no | Auto-link floor, default `0.7` |
| `MAX_IDEAS_PER_RUN` | no | Per-run ceiling, enforced by the API and the workflow |
| `DEEPSEEK_ROUTING_MODEL` / `DEEPSEEK_ANALYSIS_MODEL` | no | Default `deepseek-flash` |
| `DEEPSEEK_BASE_URL` / `TAVILY_BASE_URL` | no | Overrides for tests or proxies |

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` / `typecheck` | ESLint / `tsc --noEmit` |
| `npm test` | Vitest (pure logic: parsing, staleness, schemas) |
| `npm run smoke` | End-to-end HTTP checks against `APP_URL` |
| `npm run db:generate` / `db:migrate` / `db:grant` | Drizzle |
| `npm run db:push` | Push schema without a migration file (dev only) |

`npm run smoke` exercises auth, idempotent capture, the dashboard, projects, and
idea edit/delete, then cleans up after itself. Point it at production with
`APP_URL=https://… npm run smoke`.

## Nightly automation

`.github/workflows/nightly.yml` runs at `0 17 * * *` UTC (19:00 in Cairo during
winter, 20:00 during summer) and can be dispatched manually:

```bash
gh workflow run nightly.yml
```

It loops `POST /api/process` with a stable `runId` until the queue drains or the
cap is reached, then calls `action: "finish"`. Requirements:

- Repository secrets `APP_URL` and `WORKER_TOKEN` (`gh secret set`).
- The same `APP_URL`/`WORKER_TOKEN` values in Vercel.

Two caveats worth remembering: GitHub disables scheduled workflows after 60 days
of repository inactivity (the manual dispatch always works), and changes to
Vercel environment variables only take effect after a redeploy.

## HTTP surface

| Route | Auth | Notes |
|---|---|---|
| `POST /api/ideas` | ingest token or session | `Idempotency-Key` supported |
| `PATCH` / `DELETE /api/ideas/[id]` | session | edit text / soft delete |
| `POST /api/ideas/[id]/reanalyze` | session | re-run analysis for one idea |
| `POST /api/ideas/[id]/link` | session | manual sort: unsorted, standalone, feature, spinoff |
| `POST /api/ideas/[id]/restore` | session | undo a soft delete |
| `POST /api/process` | worker token | one idea per request; `action: "finish"` closes a run |
| `POST /api/projects`, `PATCH` / `DELETE /api/projects/[id]` | session | deleting a project unlinks its ideas |
| `GET /api/health` | none | liveness |

Pages: `/` inbox · `/ideas/[id]` · `/projects` · `/projects/[id]` · `/runs` ·
`/trash` · `/login`.

## Deploying

Vercel, with the project linked to the GitHub repo so `main` deploys
automatically. Set every required variable above for production, preview, and
development. Function region is `fra1`; the database is Supabase
`eu-central-1`. Deployments are Next.js functions, and `/api/process` declares
`maxDuration = 60`.

## Troubleshooting

- **"DeepSeek hit the output token limit before answering"** — a thinking-mode
  response spent its whole `max_tokens` budget on reasoning and returned no
  answer. Analysis calls use a generous budget; raise it further if a prompt
  grows.
- **"invalid JSON"** — `json_object` mode guarantees parseable JSON, not the
  shape asked for. The parser recovers JSON followed by prose or wrapped in a
  code fence, then retries once with the error fed back.
- **An idea is stuck `processing`** — the lock expires after 10 minutes and the
  next run reclaims it. Concurrent runs cannot double-process an idea
  (`FOR UPDATE SKIP LOCKED`), and manual actions return 409 while it is locked.
- **An idea stopped retrying** — after 3 attempts it stays `failed` until you
  use Re-analyze, which resets the attempt counter.
- **Models answered on the wrong scale** — scores are normalised, so `0.85` and
  `85` both become a valid 1–10 value instead of failing validation.

## Data

Ideas are soft-deleted and restorable from `/trash`. Projects are deleted
permanently, and deleting one parks its ideas as unsorted rather than leaving
them pointing at a project that no longer exists. Backups are whatever your
Supabase plan provides; there is no separate export path yet.
