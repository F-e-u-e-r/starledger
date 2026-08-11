# P7 — Skills Ecosystem Spec (classification as an optional layer of the Starred view)

> Status: **M0 implemented + cross-model reviewed (3/3 PROCEED, no blocker); awaiting owner commit. M1–M3 pending.**
> Stack: same as P1 (Vite · React · TypeScript · GitHub Pages, no backend). Adds one optional, fail-soft data layer and reuses the P1 dashboard surface.

Surfaces the curated task-oriented classification of the coding-agent / skills-ecosystem subset of the starred repos (source: `skills-classified.md`, 171 entries, 24 categories) **inside the existing Starred view** as optional metadata — not as a second browser and not as rendered Markdown.

Cross-model design consult (Luna@max · Luna@ultra · Sol@max, 2026-08-10) + owner verdict. The owner's three required amendments (§2) override the panel's consensus where they conflict.

---

## 1. Architecture decision (locked)

**Starred is the only canonical repo browser. The Skills ecosystem is an optional classification layer joined to Starred repos by `node_id`, exposed as a scope + metadata facets + card badges + search enrichment. It is not a third tab and not a Markdown reader.**

Rationale (owner, agreeing with Sol over the two Luna reviewers): a classification is `StarredRepo + optional classification metadata`, not a new entity universe (that is what Discovery is). A third browser would duplicate query/filter/sort/pagination/card/URL/a11y state. The 38 multi-fit repos are the decisive tell: category-sectioned rendering forces card duplication, whereas **one repo card + N classification badges** fits the data model exactly.

- Rejected **B (in-app Markdown reader)** as the primary surface. (Correction to the original framing, raised by all three reviewers: build-time Markdown→sanitized HTML _is_ CSP-safe and needs no runtime `dangerouslySetInnerHTML`; B's real fault is a second, stale representation with no live join — not CSP.) The raw `.md` is still offered as a same-origin **download**.
- Future "see the whole taxonomy at once" need → add a **group-by-primary-category view mode inside the same results surface**, still not a third browser.

Naming: **"Skills ecosystem"** (scope) / **"Skill category"** (facet). Not "Skill Packs" — 88 of 171 entries are infrastructure repos explicitly excluded from packs.

---

## 2. The three required amendments (locked, override panel consensus)

### 2.1 `stars_sha256` is provenance, not a runtime hard-invalidation gate

The panel unanimously proposed binding the classification artifact's validity to `meta.dataset_sha256 === stars.meta.stars_sha256`. **Rejected as over-coupling.** If stars go 697→698 (one new star), with the other 169 `node_id`s unchanged and the classification source unchanged, invalidating all 169 known-good classifications is not fail-soft — it is snapshot coupling.

- The artifact carries `generated_against_stars_sha256` as **provenance/evidence** (surface a soft "generated against an older snapshot" note if it differs), never as a validity gate.
- Runtime validity = **schema valid + integrity (byte-hash) valid + `node_id` valid**. Join is `classification.node_id → live repo.node_id`. A live star with no classification is simply unclassified; it never invalidates the layer.
- The only thing that would justify mismatch → whole-layer-unavailable is an explicit "this classification claims _complete coverage_ of a specific snapshot" invariant. We do not have that requirement.

### 2.2 Fail-soft contract = preserve base + deactivate dependent facet + surface degraded (never "show all silently")

The shipped bug (`filters.ts` — an active AI-category/tag facet excludes every un-annotated repo, so a bookmarked `?category=…` + a failed annotation load → **0 results**) must be fixed to this contract, and the same contract governs the future skill facets:

> **Optional-metadata failure must never suppress base entities. Any filter that depends on unavailable metadata becomes inactive/unavailable, and the UI explicitly exposes the degraded state.**

Concretely, when the layer is not `ready`:

- base Starred repos remain visible (never suppressed);
- the dependent filter is **not applied** (not merely "results happen to be all");
- the UI shows an explicit "AI/Skills classification unavailable — this filter isn't applied" notice;
- the URL value is **retained** for recoverability; the control is degraded/disabled, and it does **not** count as an effective filter in the result summary.

"Show all 697 while the Security filter still looks active" is **more** dangerous than 0 results (it reads as a successful filter) — so it is explicitly disallowed.

Model optional layers as **`loading | ready | unavailable`**, not `Data | null`. Apply their URL-derived filters only in `ready`.

### 2.3 The production filter bug is its own milestone (M0), landed first

Extract the fail-soft correctness fix into **M0**, landed and green as ground truth, before the URL/pagination substrate (M1) and the classification layer (M2) build on top of it. M2's skill filters inherit M0's contract; letting the substrate land on an un-fixed filter semantics is the review-boundary smell the owner called out.

---

## 3. Milestones (author implements; owner reviews + commits)

**M0 — correctness hotfix** (this change)

- Optional AI-annotation layer modeled as `loading | ready | unavailable`; AI-dependent filters (`categories`, `aiTags`) applied only when `ready`; base repos always preserved; degraded notice surfaced; URL retained.
- `defaultDirection(field)`: `name_with_owner → asc`, all dates/counts → `desc`. Switching the sort field resets direction to the field default (Name shows A→Z, not an inherited Z→A). (`content-visibility` is an M1 enhancement, not here.)
- Regression tests pin **three** things, not just `results.length`: (a) base repos preserved; (b) dependent facet not effective (no "· filtered"); (c) degraded state surfaced.

**M1 — browser substrate** — canonical URL-state contract (§6), 48/page pagination, density (compact default), sticky toolbar, active view/tab in URL, facet-scroll max-height fix, topic expand/**collapse** toggle. `content-visibility:auto` as enhancement only.

**M2 — classification layer** — vendor the `.md` into the repo; build-time generator (§4/§5) → `skills-classification.json` + `-meta.json`; fail-soft loader + staging mirroring AI/discovery; Skills-ecosystem scope + Skill-category facet + card badges + search enrichment + `.md` download + 3-number coverage line. Later: group-by-primary view mode.

**M3 — identity** — ledger+star mark in the header, `--accent`/`currentColor`; `/favicon.svg` asset (owner prefers a real asset over a `data:` URI — inspectable, cacheable, PWA-ready; NIT, non-blocking).

---

## 4. Data contract (M2)

`data/skills-classified.md` (vendored source) → generator → `data/skills-classification.json` + `data/skills-classification-meta.json`.

```jsonc
// skills-classification.json
{
  "schema_version": "1.0",
  "taxonomy_version": "skills-1",
  "scope": {
    "id": "coding-agent-skills-ecosystem",
    "label": "Coding-agent skills ecosystem",
    "description": "A curated subset; absence is not a classification.",
  },
  "categories": [
    {
      "id": "verification-qa",
      "label": "Verification & QA",
      "kind": "domain", // domain | infrastructure
      "definition": "…",
      "order": 0,
      "target_pack": "opus-pack",
    }, // opus-pack | design-pack | null
  ],
  "entries": [
    {
      "source_name_with_owner": "obra/superpowers", // historical, diagnostics only — never displayed as live
      "node_id": "R_…", // null when unresolved
      "resolution": "resolved", // resolved | missing_from_stars
      "primary_category_id": "roadmap-spec-driven-planning",
      "secondary_category_ids": ["verification-qa"], // ≤1 in v1; must exist and ≠ primary
      "summary": "curated one-liner",
    },
    // unresolved entries STAY in `entries` with node_id:null, resolution:"missing_from_stars"
  ],
}
```

Entries never carry stars/url/language/description — those come exclusively from the live `node_id` join.

```jsonc
// skills-classification-meta.json
{
  "schema_version": "1.0",
  "taxonomy_version": "skills-1",
  "classification_sha256": "<sha256 of the exact JSON bytes>", // integrity gate (runtime verifies)
  "source_sha256": "<sha256 of the .md>", // provenance
  "generated_against_stars_sha256": "<stars_sha256>", // PROVENANCE ONLY (see §2.1) — not a validity gate
  "generated_at": "…",
  "category_count": 24,
  "source_entry_count": 171,
  "resolved_entry_count": 171,
  "present_repo_count": 169,
  "absent_repo_count": 2,
  "unresolved_entry_count": 0,
  "canonical_repo_count": 697,
  "unclassified_repo_count": 528,
}
```

**Generator invariants (Zod + build assertions):** exactly one primary; every secondary exists & ≠ primary; unique `source_name_with_owner`; unique resolved `node_id`s; deterministic sort; bounded plaintext summaries; and the arithmetic:
`source_entry_count = resolved + unresolved`; `resolved = present + absent`; `present + unclassified = canonical_repo_count`.

---

## 5. Join & drift rules (verified 2026-08-10)

Observed against the checked-in 697-repo `stars.json`: **169/171 exact-name matches**; the 2 unresolved are `jacob-bd/notebooklm-mcp-cli` and `AgentWrapper/agent-orchestrator` (both absent — `grep` count 0). Current stars contain similarly-named `jacob-bd/gemini-notebook-mcp-cli` and `Untrivial-ai/agent-orchestrator` — **plausible renames, NOT proof of identity.** So `697 − 169 = 528` unclassified.

- The join is **build-time** (`name_with_owner → node_id`); runtime joins `node_id → live repo` only, and **never** trusts the `.md`'s name/stars/url/language.
- **No fuzzy remapping, ever.** Allowed resolution order: (1) case-insensitive exact `name_with_owner`; (2) a **human-reviewed durable alias map** (`old_owner/old_repo → node_id`), added only after manual confirmation; (3) a prior generated record's stored `node_id`. Otherwise the entry stays `unresolved` and is retained + surfaced.
- **`node_id` is stable across renames** — so once the 2 missing ids are recovered into the source (one-time, human-confirmed), a later owner rename resolves automatically to the repo's new name.
- **Three distinct coverage numbers** (never conflate): `169 matched · 528 unclassified · 2 unresolved source entries`. The downloadable metadata / coverage diagnostics MUST retain the unresolved names + reasons.

---

## 6. Canonical URL-state contract (M1)

One canonical state → URL projection. Params conceptually: `view`, `scope`, `skill` (category), `q`, filters, `sort`, `dir`, `density`, `page`, later `group`.

- Unspecified → default; **defaults are omitted from the URL** (deterministic canonical serialization; equivalent states serialize byte-identically — the existing P1 property).
- Invalid enum → default. `page < 1 → 1`; `page > lastPage → lastPage`. Malformed URL never crashes the app.
- **Reset `page → 1`** when query/search/filter/sort/scope changes; `density` change does **not** reset page.
- Direction is modeled as `defaultDirection(sortKey)` (M0), not a global `desc` guessed for every field. (M1 extends the codec to omit `dir` when it equals `defaultDirection(sort)`.)
- Back/Forward fully restores state (existing `popstate` path).

---

## 7. Filter semantics vs. search-enrichment semantics (distinct — do not share one `hasMetadata ? … : true`)

- **Filter** depending on unavailable metadata → the filter becomes **inactive**, base entities preserved, degraded surfaced (§2.2).
- **Search enrichment**: when the layer is `ready`, the search corpus = repo fields + classification labels; when unavailable, corpus = repo fields only. A query that only a classification label would have matched then legitimately returns 0 — an acceptable **degraded** result, and explicitly **not** "show all". These are different code paths.

---

## 8. Multi-fit presentation (M2)

One repo → one card, never duplicated. Model: `primary_category` + `categories[]`. Badges: `[Security] [+2]` (or full badges when space allows). Group-by-primary view mode uses **only** `primary_category`, so each repo appears exactly once.

`primary_category` must be **deterministic and sourced from the `.md`'s primary/secondary semantics** — the generator must not runtime-pick the first alphabetical category. Encoded explicitly in the generator spec.

---

## 9. Logo (M3)

Concept **B (accepted)**: a ledger page whose first ruled entry is a star (encodes ledger + starred repo + list/record — not a generic GitHub star). Inline SVG, `currentColor` + `.brand-mark { color: var(--accent) }`, wordmark `--fg`. Favicon: a `/favicon.svg` asset (owner preference over a `data:` URI; both are CSP-legal under `img-src 'self' data:`).

---

## 10. Acceptance criteria (M0)

| ID           | Test                                                                                                              | Status |
| ------------ | ----------------------------------------------------------------------------------------------------------------- | ------ |
| M0-FS-1      | `dashboardToView(state, false)` neutralizes `categories`/`aiTags`, preserves other filters                        | ✅     |
| M0-FS-2      | AI category filter + AI unavailable → base repos preserved (2 of 2), not 0                                        | ✅     |
| M0-FS-3      | AI category filter + AI ready-but-unannotated → correctly narrows to 0 (behavior intact)                          | ✅     |
| M0-FS-4      | View: bookmarked `?category=…` + no annotations → all repos, no "· filtered", degraded notice shown, URL retained | ✅     |
| M0-FS-5      | AI unavailable + a canonical filter → AI suppressed, canonical still applies, degraded shown                      | ✅     |
| M0-FS-6      | AI `loading` → filter held inactive with loading-specific wording (not "unavailable")                             | ✅     |
| M0-SORT-1    | `defaultDirection`: name→asc, dates/counts→desc                                                                   | ✅     |
| M0-SORT-2    | Selecting "Name" in the sort control yields A→Z and `?sort=name_with_owner&direction=asc`                         | ✅     |
| (regression) | full dashboard suite green (121/121)                                                                              | ✅     |

Verified: `vitest` 121/121, `pnpm -r typecheck`, eslint + prettier (changed files), Vite production build, and `@starred/deploy` verify + Pages static smoke — all green. (`pnpm format:check` is red only on pre-existing untracked `skills-staging/`, outside this change.)

---

## 11. M0 review outcome & finding dispositions

Cross-model pre-commit review (Luna@max · Luna@ultra · Sol@max, foreground single-leg runs after a background-task idle-reaper killed the parallel batches): **3/3 PROCEED — ACCEPT-WITH-NITS**, all six owner checks PASS in every lens, **zero M0 blockers**. R2 (untouched `skills-staging/` + `.prettierignore`) and R4 (no same-class twin) confirmed by all three.

| Finding                                                                                                                                                                     | Source            | Disposition                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| No test pinned the `loading` wording branch                                                                                                                                 | luna-max, sol-max | **Fixed** — added `M0-FS-6`.                                                                                                                                                                                                                           |
| Loader-prop swap after load doesn't reset status → stale annotations could apply to a replacement dataset                                                                   | sol-max           | **Rejected-with-reason (logged):** production `App()` takes no loader props (effect deps stable, runs once) — no shipped trigger; a reset-on-swap guard would be complexity for a test-only path. Revisit only if a runtime loader-swap path is added. |
| Provenance naming drift: existing `ai-annotations-meta.json` uses `dataset_sha256`; a P7 artifact using `generated_against_stars_sha256` would be rejected by the AI loader | luna-ultra        | **M2 action item:** the M2 generator/loader owns its own meta schema; do not reuse the AI loader's gate. Current AI layer unaffected.                                                                                                                  |
| R1 (missing URL direction → global `desc`), R3 (Filters badge counts suppressed AI filters)                                                                                 | all three         | **M1-deferred** (owner-accepted).                                                                                                                                                                                                                      |
