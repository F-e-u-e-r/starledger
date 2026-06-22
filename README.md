# StarLedger

A personal GitHub stars dashboard and repository discovery pipeline, built in phases:

| Phase  | What                                                                  | Status                                                                                                                         |
| ------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **P0** | Deterministic **exporter**: stars → canonical `stars.json`            | ✅ complete                                                                                                                    |
| P1     | Static **dashboard** on GitHub Pages (client-side filter/sort/search) | ✅ complete                                                                                                                    |
| P2     | **Notifier**: YouTube / awesome-stars → one-shot Telegram delivery    | release candidate (P2.5 closure); live run pending                                                                             |
| P3     | **AI classification**: categories, tags, summaries, semantic search   | P3.0–P3.4 implementation complete; P3.5 ADR complete; provenance-gate registration + live closeout pending before executor use |
| P4     | Reusable template / workflow (fork model, no key custody)             | planned                                                                                                                        |

Contracts: **[`docs/P0-exporter-spec.md`](docs/P0-exporter-spec.md)** (exporter) · **[`docs/P1-dashboard-spec.md`](docs/P1-dashboard-spec.md)** (dashboard) · **[`docs/P2-notifier-spec.md`](docs/P2-notifier-spec.md)** (notifier) · **[`docs/P3-ai-spec.md`](docs/P3-ai-spec.md)** (optional AI enrichment).

## Quick start

```bash
pnpm install        # Node >= 22
pnpm typecheck      # tsc --noEmit across packages
pnpm test           # vitest
pnpm build          # tsup + vite → dist (CLI + dashboard)
pnpm schemas        # regenerate schemas/*.json from the Zod schemas
pnpm release-gate   # full P0 gate: typecheck·lint·test·build·schemas·real-git smoke
pnpm p2-gate        # P2 notifier gate: quality checks + state/replay smokes
pnpm p3-gate        # P3 quality checks + generated AI-schema drift

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
packages/notifier        @starred/notifier        YouTube / awesome-stars source polling · durable state branch · pending queue · CLI
packages/ai-schema       @starred/ai-schema       strict optional-AI artifact, job, manifest, and candidate contracts
packages/classifier      @starred/classifier      deterministic candidate validation, artifact assembly, and agent diff gate
apps/dashboard           @starred/dashboard       Vite + React static site: trusted loading + schema validation (P1)
schemas/                 generated JSON Schemas
```

## Running the notifier

Configure watched channels in `config/notifier.yaml` (starting from
`config/notifier.example.yaml`), then provide only environment secrets:

```bash
export STAR_SYNC_TOKEN=github_pat_...   # public GitHub reads
export TELEGRAM_BOT_TOKEN=123456:...
export TELEGRAM_CHAT_ID=-100...
pnpm --filter @starred/notifier build
node packages/notifier/dist/cli.js --config config/notifier.yaml
```

Notifier state is validated and committed only when changed on the dedicated
`starledger-state` branch. A successful Telegram send followed by a process
crash before that state push can resend once on recovery; this is the accepted
at-least-once boundary.

Exit codes mirror the exporter: `0` clean · `20` deferred (a retryable failure
left work pending, or a new `permanent_failure` surfaced once) · `10` fatal
(missing/invalid GitHub or Telegram credential, bad destination, or invalid
config/state) — a fatal run persists nothing. A pending item stuck past
`retry.attention_after_attempts` is reported as `attention` but never dropped.

To manually send the test-chat smoke message, run `TELEGRAM_SMOKE=1 pnpm
smoke:telegram`. The local test-chat smoke has passed; a live controlled
delivery + no-duplicate replay on hosted Actions remains the final validation —
the step-by-step runbook is the **Live validation** section of
[`docs/P2-notifier-spec.md`](docs/P2-notifier-spec.md).
