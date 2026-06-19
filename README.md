# StarLedger

A personal GitHub stars dashboard and repository discovery pipeline, built in phases:

| Phase  | What                                                                      | Status      |
| ------ | ------------------------------------------------------------------------- | ----------- |
| **P0** | Deterministic **exporter**: stars → canonical `stars.json`                | ✅ complete |
| P1     | Static **dashboard** on GitHub Pages (client-side filter/sort/search)     | ✅ complete |
| P2     | **Notifier**: YouTube / awesome-stars → Telegram, with the star-back loop | planned     |
| P3     | **AI classification**: categories, tags, summaries, semantic search       | planned     |
| P4     | Reusable template / workflow (fork model, no key custody)                 | planned     |

Contracts: **[`docs/P0-exporter-spec.md`](docs/P0-exporter-spec.md)** (exporter) · **[`docs/P1-dashboard-spec.md`](docs/P1-dashboard-spec.md)** (dashboard).

## Quick start

```bash
pnpm install        # Node >= 22
pnpm typecheck      # tsc --noEmit across packages
pnpm test           # vitest (117 tests)
pnpm build          # tsup + vite → dist (CLI + dashboard)
pnpm schemas        # regenerate schemas/*.json from the Zod schemas
pnpm release-gate   # full P0 gate: typecheck·lint·test·build·schemas·real-git smoke

pnpm --filter @starred/dashboard dev    # run the dashboard locally (reads ./stars.json)
```

## Running the exporter

The exporter reads the viewer's stars using a **fine-grained PAT** (read-only, `Starring: read`, **no** write access to this repo) supplied via `STAR_SYNC_TOKEN`:

```bash
export STAR_SYNC_TOKEN=github_pat_...
node packages/exporter/dist/cli.js --out-dir .
# or in dev: pnpm --filter @starred/exporter start
```

`stars.json` and `dataset-meta.json` are validated in a staging area, then published together in **one Git commit** and pushed — that commit is the only remote publication boundary, so a reader sees either the previous valid commit or the next complete one. Outputs:

- `stars.json` — canonical dataset (changes only when content changes)
- `dataset-meta.json` — fingerprint (`stars_sha256`, `repo_count`); committed with `stars.json`
- `run-meta.json` — per-run telemetry (**git-ignored**; upload as a CI artifact)

Exit codes: `0` published (or unchanged) · `20` deferred — do not publish, remote last-known-good preserved (incomplete enumeration, rate limit, degraded over threshold, validation/commit/push failure) · `10` fatal (auth/schema/config). A failed push leaves the remote unchanged and reports `published=false`.

> Note: when a user has very many stars, `viewer.starredRepositories.isOverLimit` becomes true and GraphQL can no longer return the full list. The exporter then enumerates the complete list via REST `/user/starred` (`star+json`, full Link chain) and hydrates metadata through GraphQL `nodes(ids:)`, merged by `node_id` — proven byte-identical to the GraphQL path (DET-1). An unrecoverable REST page fails closed (exit 20) rather than publishing a truncated set.

## Workspace

```
packages/schema          @starred/schema         canonical Zod model + JSON Schema generation (shared by exporter + dashboard)
packages/github-client   @starred/github-client  errors · retry coordinator · GraphQL probe/pagination/hydrate (bisection) · REST enumeration
packages/exporter        @starred/exporter        config · enumerate (dual-path) · hydrate-merge · degraded gate · serialize · staged git publish · CLI
apps/dashboard           @starred/dashboard       Vite + React static site: trusted loading + schema validation (P1)
schemas/                 generated JSON Schemas
```
