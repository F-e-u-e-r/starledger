# P1 — Dashboard Specification

> Status: **P1.1 implemented** (Vite + React + TS scaffold, trusted loading, states, Pages base path; typecheck + tests + build green). P1.2–P1.4 scoped below.
> Stack: Vite · React · TypeScript · `@starred/schema` · GitHub Pages. No backend.

A static, client-side dashboard that loads the canonical `stars.json` produced by P0 and lets a user search, sort, and filter their starred repositories. State is reproducible (URL), data semantics are correct, and deployment needs no server.

> Naming: the workspace uses `@starred/*` (the P1 review examples wrote `@starledger/*`). The Pages base path is derived from `GITHUB_REPOSITORY` at build time, so a project rename needs no code change.

---

## 1. Architecture

```
apps/dashboard/
  src/
    app/         App + state machine
    components/  state views (loading/error/empty), later cards/table/facets
    data/        load-stars.ts (trusted loading), later derive-fields.ts
    features/    repositories / search / filters / sorting   (P1.2+)
  index.html  vite.config.ts

packages/schema   ← shared canonical model (single source of truth, reused from P0)
```

The dashboard validates `stars.json` against the **same** `@starred/schema` the exporter writes — no schema drift.

---

## 2. Trusted data-loading contract (P1.1)

Extends the P0 publication contract to the reader:

1. fetch `dataset-meta.json` (no-cache) → JSON parse → `DatasetMetaSchema`
2. take `stars_sha256`
3. fetch `stars.json?sha=<hash>` — busts stale Pages/CDN/browser caches (both files came from the same commit, so the hash is the right cache key)
4. verify the **raw bytes'** SHA-256 == `stars_sha256` (integrity) **before** parsing
5. parse + `StarsFileSchema` validation
6. only then hand data to the UI

A single integrity mismatch is most likely a **cross-deployment read race** on Pages (old meta + new stars, or vice versa), so the **whole snapshot** (meta + stars) is re-fetched once before failing. Any failure throws a typed `DataLoadError` (`fetch` | `schema` | `integrity`) and the UI **fails closed** — never renders unvalidated data. An empty dataset is a normal empty state, not an error.

---

## 3. Derived fields (P1, not P0)

Computed at view time from raw fields, e.g.:

```ts
type DerivedRepo = CanonicalRepo & {
  lastActivityAt: string | null;
  monthsSincePush: number | null;
  isStale: boolean;
  hasStableRelease: boolean;
  hasAnyRelease: boolean;
};
```

The `null` vs unknown distinction from P0 must be preserved in display: a field in `unavailable_fields` shows **"information unavailable"**, NOT "none". E.g. a hydration-failed repo must not render `latest_stable_release: null` as "No releases".

---

## 4. Milestones

|          | Content                                                                                                                                                                                                                        | Status  |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| **P1.1** | Vite/React/TS scaffold · shared schema · load + validate `dataset-meta` + `stars` · loading/error/integrity/empty states · Pages base path                                                                                     | ✅ done |
| P1.2     | search (name/description/topics/language) · sort (starred_at/stars/pushed/release/name) · filters (language/topics/license/archived/fork/has-release/stale/hydration) — substring search, AND across facets, OR within a facet | ◻       |
| P1.3     | UX: cards/table · result count · filter chips · clear-all · sort direction · responsive · keyboard a11y · **URL query state**                                                                                                  | ◻       |
| P1.4     | GitHub Pages deploy via Actions Pages artifact (not a `gh-pages` branch); copy `stars.json`+`dataset-meta.json` into `dist/`                                                                                                   | ◻       |

**Explicitly excluded from P1:** AI categories, semantic search, Telegram, login, server/API, user editing, charts, heavy animation, IndexedDB.

---

## 5. Acceptance tests

| ID       | Test                                                              | Status |
| -------- | ----------------------------------------------------------------- | ------ |
| DATA-1   | valid `stars.json` passes shared schema and renders               | ✅     |
| DATA-2   | schema-invalid `stars.json` → no records rendered (fail closed)   | ✅     |
| DATA-3   | `dataset-meta` hash ≠ `stars` bytes → integrity error             | ✅     |
| DATA-3B  | transient cross-deploy mismatch recovers on a full-snapshot retry | ✅     |
| DATA-3C  | persistent mismatch → fail closed after one retry                 | ✅     |
| DATA-4   | unavailable release field shows "unknown", not "no release"       | ◻ P1.3 |
| EMPTY-1  | zero repositories → normal empty state, not an error              | ✅     |
| PATH-1   | under `/<repo>/` base, assets + data load (sha-busted)            | ✅     |
| SEARCH-1 | search matches name/description/topic/language                    | ◻ P1.2 |
| SORT-1   | each sort field has a fixed rule for null/unknown                 | ◻ P1.2 |
| FILTER-1 | AND across facets, OR within a facet                              | ◻ P1.2 |
| URL-1    | search/sort/filters survive reload (URL state)                    | ◻ P1.3 |
| A11Y-1   | search/filter/sort operable by keyboard                           | ◻ P1.3 |

Current dashboard suite: load-stars (DATA-1/2/3/3B/3C, EMPTY-1, PATH-1, fetch-fail) + App state machine (loaded/empty/integrity-error) — all green.

---

## 6. Exit condition

> P1 is complete when a user can reliably load the canonical stars dataset on GitHub Pages and quickly search, sort, and filter repositories; all state is reproducible, data semantics are correct, and deployment depends on no backend.
