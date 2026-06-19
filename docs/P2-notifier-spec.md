# P2 — Discovery Notifier

`@starred/notifier` watches discovery **sources** (YouTube channels, the
`awesome-stars` list), resolves the GitHub repositories they mention, and
delivers a one-shot Telegram notification per newly-discovered repository. It is
additive: it does **not** modify the P0 exporter or the canonical `stars.json`,
and persists its own state on a dedicated branch.

This document is the contract. It is intentionally invariant-led.

## Boundaries (what P2 is NOT)

No YouTube transcripts as a required dependency · no automatic repository
starring · no inbound Telegram commands · no webhook server · no multi-user · no
private-repository discovery · no exactly-once claims (see _at-least-once_ below)
· no committed secrets · no alternate backend · **no AI as a required
dependency** (the deterministic summary is the contract; the LLM adapter is
optional).

## Package layout

```
packages/notifier/src/
  models.ts        contracts: DiscoveryItem · ResolvedRepository · PendingNotification · DeliveryRecord · key helpers
  config.ts        versioned config (yaml+zod) + env secret readers
  state.ts         NotifierState schema · cold-start · validate · deterministic serialize · retention
  state-store.ts   StateStore interface + Git state-branch persistence (worktree)
  github-url.ts    GitHub URL extraction + normalization + reserved-path rejection (pure)        [P2.1]
  sources/         youtube.ts · awesome-stars.ts · index.ts (per-source isolation)               [P2.1]
  resolve-repo.ts  live GitHub resolution → ResolvedRepository (node-id dedup, rename-safe)       [P2.2]
  summary.ts       SummaryProvider: deterministic (required) + timeout-safe optional LLM fallback [P2.3]
  telegram.ts      HTML-safe, length-budgeted renderer + sender                                   [P2.3]
  run.ts / cli.ts  orchestration + CLI
```

## The state machine (the heart of P2)

A source observes an **item** (a video, or a repo added to the list). One item
may reference **N repositories** (a video description can list several). Each
`(item, repository)` pair is one notification.

### Identity

```
item_key         = source : source_item_id                  (one per observed item)
notification_key = source : source_item_id : repo_node_id    (one per repository in the item)
```

`repo_node_id` is only known **after** GitHub resolution. Therefore the **durable
unit of work is the item, not the notification** — a `PendingNotification`
carries the full `DiscoveryItem` payload and is keyed by `item_key`. The
per-repository `notification_key` is the identity recorded in the delivery log
once a specific repository is sent.

> **Divergence from the P2 sketch (please review).** The sketch showed a pending
> entry already keyed by a full `youtube:VIDEO_ID:R_NODE`. That is the common
> 1-repo case, but it cannot represent the very failure the sketch's fix #2 is
> about: _"RSS finds video → GitHub API fails → lost."_ At that point there is no
> `node_id` yet. So pending is keyed by `item_key` (pre-resolution safe) and the
> `node_id`-bearing key lives on the **delivery** records. This strictly
> generalizes the sketch and handles 1-repo and N-repo items identically.

### Lifecycle invariant

A pending item leaves the queue **only** when every notification it implies has
reached a terminal delivery:

```
pending ── all referenced repos delivered ───────────────▶ (removed; one `sent` per repo)
        ── item has no resolvable repository ────────────▶ skipped_no_repo   (item-level)
        ── item malformed / permanently unresolvable ────▶ permanent_failure (item-level)
        ── retryable failure (GitHub down, Telegram 5xx) ▶ stays pending (attempts++, last_error)
```

- `sent` is **per repository** → `source:item:node_id`. It is the at-least-once
  replay guard: a repeated run skips any `notification_key` already `sent`. A
  video with repos A and B where A sent but B's send failed keeps the item
  pending; the retry skips A (already `sent`) and re-sends only B.
- `skipped_no_repo` / `permanent_failure` are **item-level** → `source:item`
  (no repository was involved). The pending item is removed.
- Retryable failures **never** drop the item; the payload persists across runs
  even after the item scrolls out of the source's recent window (fix #2).

### Cold start (fix #3)

Each source carries an explicit `initialized` flag. Cold start is **never**
inferred from an empty seen-set (pruning could empty it later). The first run
baselines the source's current items and emits **nothing**; subsequent runs emit
only genuinely new items.

### At-least-once window (documented, accepted)

```
Telegram send succeeds → process crashes before the state push
  → next run re-sends that one notification once (it is not yet recorded `sent`).
```

This is the accepted boundary. We do not claim exactly-once.

## Contracts

`models.ts` defines, as strict Zod schemas: `DiscoveryItem` (description &
`published_at` nullable; `extraction_text` is what resolution scans),
`ResolvedRepository` (hydrated **current** identity for rename/transfer safety +
the metadata the deterministic summary needs), `PendingNotification` (full item
payload + attempts + last_error), and `DeliveryRecord` (terminal status only).
`NOTIFIER_SCHEMA_VERSION` is deliberately **separate** from the stars dataset's
`SCHEMA_VERSION`.

## State & persistence

`NotifierState` (see `state.ts`):

```jsonc
{
  "schema_version": "1.0",
  "youtube": {
    "<channel_id>": {
      "initialized": true,
      "etag": null,
      "last_modified": null,
      "recent_seen": [{ "id": "<video>", "seen_at": "<iso>" }],
    },
  },
  "awesome_stars": {
    "initialized": true,
    "repository": "maguowei/awesome-stars",
    "ref": "master",
    "paths": ["README.md"],
    "last_commit_sha": "<sha>",
  },
  "pending": [
    /* PendingNotification[] — never pruned */
  ],
  "deliveries": [
    /* DeliveryRecord[] — pruned by age then count */
  ],
}
```

- **Validate-before-replace.** A schema-invalid loaded state throws (deferred);
  the last-known-good remote is kept, never overwritten with a repaired guess.
- **Deterministic bytes.** `serializeState` emits fixed key order + sorted
  dynamic collections + a single trailing newline, so an unchanged state is
  byte-identical and the persist step is genuinely commit-on-change.
- **One writer, one commit.** State lives on `state.branch` (default
  `starledger-state`) and is written with Git plumbing without checking out or
  mutating the main worktree. Persisting is validate → write → one commit → push,
  gated on a content change. **A push failure leaves the remote state unchanged**
  (mirrors the exporter's publish discipline). Workflow concurrency
  (`group: notifier`) keeps it single-writer.
- **Retention.** `recent_seen` is capped per channel; `deliveries` are pruned by
  `delivery_days` then `delivery_max`; `pending` is never pruned.

## Sources (P2.1)

Detection is required; description enrichment is best-effort (fix #1).

- **YouTube.** Poll each channel's Atom feed with `If-None-Match` /
  `If-Modified-Since`; `304` ⇒ no work, no state change. Parse entries into
  `DiscoveryItem`s; a missing `media:description` yields `description: null` and
  is fine. New = video id not in `recent_seen`.
- **awesome-stars.** Compare the head commit SHA touching the watched paths. On
  change, fetch the file content at the **old** and **new** SHA, extract the
  **set** of GitHub repo URLs from each, and emit the set difference (new − old)
  — a repository **set diff, not a markdown line diff**. The URL set is never
  persisted; only `last_commit_sha` is.

A retryable source failure advances **no** state for that source (its cursor /
etag / sha is left untouched), so the change is re-observed next run.

## Resolution (P2.2) · Summary & delivery (P2.3) · Workflow (P2.4)

Summarized here; implemented in later milestones.

- **Resolution.** Normalize HTTPS/SSH/`.git`/subpath URLs to `owner/repo`; reject
  reserved routes (topics, marketplace, settings, sponsors, orgs, users,
  features, collections); resolve through GitHub, dedupe by `node_id`, use the
  hydrated current name/URL (rename/transfer safe), reject private. No
  resolvable repo ⇒ `skipped_no_repo` (not a run failure). The pure URL layer
  (`github-url.ts`) already lands in P2.1 because the awesome-stars set diff
  needs it.
- **Summary.** `SummaryProvider` interface; the deterministic implementation
  (description, primary language, topics, stars, latest release) is the
  contract. The optional LLM adapter falls back to deterministic on any failure;
  P2 passes and runs without `LLM_API_KEY`.
- **Telegram.** HTML mode; escape `&<>` in all external text and attribute URLs;
  **budget field widths before render** so the final payload never exceeds 4096
  chars after entity parsing and truncation never splits a tag or entity.
- **Workflow.** `.github/workflows/notify.yml` — `cron: '17 * * * *'`,
  `workflow_dispatch`, `concurrency: { group: notifier, cancel-in-progress: false }`.
  It checks out `main`, builds only `@starred/notifier`, and runs the CLI with
  `STAR_SYNC_TOKEN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, and optional
  `LLM_API_KEY`. `GitStateStore` creates/updates the dedicated state branch via
  Git plumbing without changing the checked-out `main` worktree.

## Release gate

`pnpm p2-gate`: typecheck · lint · format · unit/integration tests · source
fixture coverage · real-Git state-branch smoke · built-artifact replay smoke.
`pnpm smoke:telegram` is an opt-in manual test-chat smoke; it sends only when
`TELEGRAM_SMOKE=1` and valid Telegram credentials are provided.

## Implementation status

- **P2.0 — contracts + scaffold:** ✅ models, config, state, docs, example config.
- **P2.1 — sources + durable state:** ✅ github-url, YouTube + awesome-stars
  sources, Git state-branch persistence, source isolation, real-Git state smoke.
- **P2.2 — GitHub resolution:** ✅ candidate normalization/rejection, public
  REST hydration, node-id deduplication, rename/transfer-safe current identity,
  partial-resolution retry.
- **P2.3 — summary + delivery:** ✅ deterministic summary, timeout-safe optional
  LLM fallback boundary, safe HTML/length-budgeted Telegram rendering, replay
  guard, durable at-least-once delivery state.
- **P2.4 — workflow + live gate:** ✅ workflow and local gate implemented:
  hourly workflow, single-writer concurrency, state/replay smokes, and opt-in
  Telegram test-chat smoke. The local test-chat delivery has passed. The first
  GitHub Actions run remains the final hosted validation step.
