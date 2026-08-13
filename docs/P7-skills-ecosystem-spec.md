# P7 — Skills Ecosystem Spec (classification as an optional layer of the Starred view)

> Status: **M0 merged (#234); M1.1 merged (#237). M1.2 complete (a–f, per-slice acceptance records in §13) — local commits on `feat/m1.2-browser-ux`, PR pending. M2–M3 pending.**
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

**M1 — browser substrate** (split into owner-reviewed sub-milestones).

**M1.1 — canonical state contract + minimal pagination proof** (this change) — the full §6 canonical state/codec: three new canonical fields (`view`, `density`, `page`); the decode→normalize→encode→decode round-trip extended to cover them; R1 convergence (§6.1); requested→effective page reconciliation (§6.2); page-reset on a **semantic** change to filter/search/sort/view, density exempt, explicit `page` wins (§6.3); `activeView` consolidated out of `App.tsx` into `state.view` (§6.4); and the smallest observable pagination proof — fixed **48/page**, real result slicing, minimal Prev/Next controls. Behavioral tests cover the codec, the reset matrix, reconciliation + `replace` semantics, 48/page slicing boundaries, and view fail-soft. **Not** in M1.1: any UX polish (below).

**M1.2 — browser interaction + compact-density UX** (active — acceptance boundary in §13) — density toggle UI + compact visual treatment, sticky toolbar, facet-scroll max-height fix, topic expand/**collapse** toggle, and R3 (effective-filter-count) convergence; `content-visibility:auto` as an enhancement only. Ordered R3 → density → sticky → facet-scroll → topic collapse → integrated regression.

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

One canonical state → URL projection. Params conceptually: `view`, `scope`, `skill` (category), `q`, filters, `sort`, `direction`, `density`, `page`, later `group`. **M1.1** lands the mechanics for the fields that exist today — `view`, `density`, `page` plus the M0 sort/direction codec — and the reconciliation model; `scope`/`skill`/`group` arrive with M2.

- Unspecified → default; **defaults are omitted from the URL** (deterministic canonical serialization; equivalent states serialize byte-identically — the existing P1 property). The default state serializes to `''`.
- Invalid enum → default. Malformed URL never crashes the app.
- Canonical emit order is fixed: `view`, then the existing P1 order (`q`, `sort`, `direction`, array facets, booleans, release/hydration), then `density`, then `page`.
- Back/Forward fully restores state (existing `popstate` path).

### 6.1 Sort/direction codec — R1 convergence (M1.1)

- **Decode:** `direction = <valid direction param> ?? defaultDirection(sort)` — a _missing_ `direction` resolves to the sort field's natural default (M0's `defaultDirection`), **not** a global `desc`. This is the R1 fix (previously M1-deferred).
- **Encode:** emit `sort` iff it differs from the default sort; emit `direction` iff `direction !== defaultDirection(sort)`. The two params are now **independent** — a non-default sort at its natural direction emits `sort` alone (this supersedes the P1 "sort+direction always travel together" rule; test `URL-5` is updated with rationale).
- **Backward-compat:** a legacy URL carrying a _redundant_ default `direction` (e.g. `sort=name_with_owner&direction=asc`) still decodes correctly; the redundancy is simply dropped on the next canonical re-serialization.

### 6.2 Page — requested vs. effective (M1.1)

- **Decode accepts the requested page** (`page >= 1`; `< 1`, non-integer, or absent → `1`). It is **not** clamped against the dataset at decode time — `normalizeDashboardState` has no result count and stays pure.
- **Effective page** is derived where the filtered result count is known (`RepositoryView`): `lastPage = max(1, ceil(resultCount / 48))`; `effectivePage = clamp(requestedPage, 1, lastPage)`. Rendering slices by `effectivePage`.
- **Reconciliation:** when `requestedPage !== effectivePage`, the canonical URL is **`replace`-written** with `effectivePage` (no history push). This is how "serialize writes the effective/canonical value" is realized without a data-aware codec, and it converges in one step (the rewritten `effectivePage` is a fixed point).

### 6.3 Page-reset semantics (M1.1)

- **Reset `page → 1`** on a **semantic value change** to query/search/filter/sort/**view** (`scope` joins this set in M2) — compare normalized before/after values; a no-op write (re-setting a field to its current value) does **not** reset. `density` change does **not** reset page.
- An **explicit `page`** supplied in the same update **wins** and is never overwritten by the implicit reset. (Rationale: key-presence resets fire on no-op writes and on future refactors that pass through unchanged fields.)

### 6.4 View — capability fail-soft (M1.1)

- `view` (active tab: `stars` | `discovery`) is **canonical state**, consolidated out of `App.tsx`'s local `activeView` so there is a single source of truth; the state hook is lifted to `App` and its controls are passed down (no second hook instance writing the URL).
- **Asymmetry with `page` (deliberate):** a bookmarked `view=discovery` while the optional discovery substrate is unavailable is a _recoverable_ request — the **requested value is retained in the URL** and the **effective render falls back to `stars`** (mirrors the M0 AI-facet fail-soft, §2.2), re-applying once discovery loads. Unlike `page`, it is **not** reconciled/rewritten, because it may become valid later; an out-of-range `page` never becomes valid for the current dataset, so it is canonicalized.
- **Empty stars must not dead-end an available discovery view:** the full-screen empty state renders only when there is genuinely nothing to show (`stars` empty **and** `discovery` unavailable). When discovery is available the tabs remain and a bookmarked `view=discovery` reaches the inbox even with zero stars (the stars pane shows the empty state in place). The `repos.length === 0` early return is therefore evaluated **after** `view` resolution, not before.

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
| R1 (missing URL direction → global `desc`), R3 (Filters badge counts suppressed AI filters)                                                                                 | all three         | **M1-deferred** (owner-accepted).<br>Update 2026-08-10: R1 (missing `direction`) → **implemented in M1.1** (§6.1); R3 (Filters badge counts) → **M1.2+**.                                                                                              |

---

## 12. M1.1 acceptance & review outcome

Implemented on `feat/m1.1-state-contract` (base = M0 `2987e92`).

### Acceptance (all green)

- **Codec** — `view`/`density`/`page` round-trip; defaults omitted; canonical emit order fixed; `normalize`/`parse`/`serialize` idempotent and closed (incl. huge/`Infinity` pages → `MAX_SAFE_INTEGER`).
- **R1** — decode a missing `direction` → `defaultDirection(sort)`; encode omits `direction` when it equals the field default; a legacy redundant `direction` still decodes (dropped on re-serialize). Old test `URL-5`/`M0-SORT-2` updated with rationale.
- **Page** — requested accepted (junk/0/neg/decimal → 1; repeated → last valid); effective clamped in `RepositoryView`; out-of-range reconciled via `replace` (no history push); stale page canonicalized by App when no populated stars surface exists.
- **Reset** — `page → 1` on a semantic change to query/search/filter/sort/view; `density` exempt; no-op update does not reset; explicit `page` wins; clear-all preserves `view` + `density`.
- **View** — consolidated out of `App` local state into canonical `state.view` (single hook lifted to `App`); fail-soft (requested retained, effective falls back to `stars`); empty stars never dead-ends an available discovery view.
- **Pagination proof** — 48/page slicing + minimal Prev/Next; boundary controls use `aria-disabled` (focus-safe) + guarded no-op.

Verified: `vitest` **784/784**, `pnpm -r typecheck`, `eslint .`, `prettier --check` (changed) — all green.

### Cross-model review (Luna@max · Luna@ultra · Sol@max, 3 rounds)

- **R1:** F1 (codec not closed for huge pages), F2 (empty-stars early return hid an available discovery view — Sol + Luna), F3 (pager disabled the focused control). All fixed.
- **R2:** A (clear-all also wiped `view`/`density` — real regression), B (overlong digit page → `Infinity` → 1), C (page not reconciled when `RepositoryView` unmounted). All fixed. D (tab-visibility vs `effectiveView` divergence, Luna-max) dismissed.
- **R3:** Sol-max **PROCEED**, Luna-ultra **PROCEED** (all fixes confirmed; D independently verified non-existent). Luna-max re-raised **D**; **confirmed false positive** — `App.tsx` tab visibility is `discovery && discovery.candidates.length > 0`, byte-identical to `discoveryAvailable`, so an empty-`candidates` payload hides the tab and its failure scenario cannot occur (ground-truth verified).

Outcome: every real finding across three rounds fixed with a pinned regression test; the sole outstanding BLOCK is a verified misread. Ready for owner commit.

---

## 13. M1.2 acceptance boundary — browser interaction + compact-density UX

M1.1 built the correctness substrate; M1.2 is a pure interaction/presentation slice and does
NOT reopen the canonical-state architecture. Implement in order (each owner-reviewed; xcheck
before each commit). R3 leads because it still carries semantic correctness, so it is not
buried under the later CSS/layout diffs.

**M1.2a — R3 effective-filter-count convergence.** The Filters toggle badge/count reflects the
**effective** (active) filter count. Requested-but-inactive optional-AI filters
(`categories`/`aiTags` while the AI layer is not `ready`) do **not** inflate the badge; they
remain visible as removable chips + a degraded notice (§2.2), consistent with the result
summary's existing `effectiveFilterCount`. Once the AI layer becomes `ready` and the requested
filter activates, the badge updates.

**M1.2b — density control + compact/comfortable presentation.** A control writes ONLY canonical
`density`; `compact` is the §6 default. Density change preserves the current page;
reload/back/forward reproduce the density. `compact` materially raises information density with
no content/action removed to achieve it; `comfortable` stays usable and visually distinct; both
preserve repository actions/links.

**M1.2c — sticky toolbar.** Search/filter/sort/view/density controls stay reachable while
browsing; must not obscure content; narrow-viewport behavior explicitly tested; no second local
owner for canonical controls (an ephemeral `is-scrolled` presentation flag is fine).

**M1.2d — facet-scroll.** Long facet groups get bounded scrolling; the page itself must not
overgrow because one facet is large; keyboard/mouse scrolling stays usable; selected values
remain reachable (the active-filter chips already surface selections).

**M1.2e — topic expand/collapse.** Deterministic collapsed default/threshold; selected topics
never hidden behind a collapsed section without indication. This is **LOCAL presentation state,
NOT canonical URL state** — §6 is not extended for it.

**M1.2f — integrated behavioral/regression pass.** density→URL, density-does-not-reset-page,
sticky presence/continuity, facet overflow, topic collapse, and the R3
loading/unavailable/ready matrix — all green together.

### Per-slice acceptance

**M1.2a (2026-08-13)** — gates: `pnpm -r typecheck` · `eslint .` · `prettier --check` (slice files) · `vitest run` **788/788** (+4 R3). Cross-model review (per-slice policy: one round of Luna@max · Luna@ultra · Sol@max, escalate only on a real correctness/spec finding): **3/3 PROCEED, zero findings** — all six M1.2a checks PASS from all three lenses. Reviewed diff = this commit minus this note (doc-only, added post-verdict).

**M1.2b (2026-08-13)** — gates: `pnpm -r typecheck` · `eslint .` · `prettier --check` (slice files) · `vitest run` **793/793** (+5 DENS). Cross-model review (per-slice policy, one round of Luna@max · Luna@ultra · Sol@max): **3/3 PROCEED, zero findings** — all eight M1.2b checks PASS from all three lenses. Reviewed diff = this commit minus this note (doc-only, added post-verdict). Owner visual smoke (Chromium): compact 3 columns vs comfortable 2 (+50% cards/row, 309px vs 465px tracks) under the pre-existing 1280px dashboard cap — widening the cap for 4 columns is explicitly NOT required and NOT folded into later slices; narrow 390px single-column, no horizontal overflow.

**M1.2c (2026-08-13)** — gates: `pnpm -r typecheck` · `eslint .` · `prettier --check` (slice files) · `vitest run` **796/796** (+3 STICK). Cross-model review (adaptive, 2 rounds): R1 Luna@max + Luna@ultra **FIX** — one confirmed defect (the ≤520px `.view-tabs { position: static }` override preceded the base sticky rule in source order and silently lost at equal specificity), Sol@max PROCEED (missed it); fixed by relocating the override after the view-tabs section with rationale comments at both sites, re-verified in-browser (390px + tabs: static, scrolls away; desktop 48px stacking intact). R2 on the amended diff: **3/3 PROCEED, zero findings**. Browser smoke: desktop stuck toolbar top=0 (55px, opaque, z below drawer); tabs-stacked offset by `--view-tabs-h` with zero overlap; narrow static, no overflow. Reviewed diff = this commit minus this note (doc-only, added post-verdict).

**M1.2d (2026-08-13)** — gates: `pnpm -r typecheck` · `eslint .` · `prettier --check` (slice files) · `vitest run` **800/800** (+4 FSCROLL). Cross-model review (adaptive): R1 full lineup — Luna@max + Luna@ultra PROCEED; Sol@max **FIX**, a real defect class: bounding keyed on `showAll` missed collapsed lists inflated past the budget by selected-overflow rows (Sol's cited "Show fewer" trigger does not exist, but three real paths do — URL preselection, drawer-instance selections, section collapse/reopen resetting `showAll`); fixed by keying the bound on rendered length, pinned by FSCROLL-4. R2 on the amended diff: Luna@max **PROCEED** (3/3) — then both external providers died mid-round (Codex usage limit, reset 2026-08-18 11:46; Grok 402 balance exhausted): Luna@ultra + Sol R2 legs are **recorded missing lenses**, not claimed. §6 fallback: fresh-context same-model critic (packet-vs-tree byte-identity, source verification of all three paths, fourth-path hunt empty, vitest re-run 38/38) **PROCEED** with one comment-only nit, fixed post-verdict and disclosed. Browser smoke: 2236-topic expansion contained in a 352px box; page height 8449px unchanged; collapsed default 332px no-scroll; focused deep option auto-scrolls into view; drawer facet bounded (352 vs 809). **Backfill pending** (owner ruling): Sol + Luna@ultra re-run on this slice after the 2026-08-18 quota reset as **assurance backfill** — the recorded gap stays in history (never retroactively rewritten to "3/3 complete"); AGREE closes the residual, a new verified correctness finding reopens M1.2d as a normal amendment, a nit changes nothing. _(Provenance precision, added in the PR #239 review: the `showAll`-keyed intermediate that R1 reviewed existed only in the working tree between R1 and its same-session fix and was never separately committed — `f48ac8e^` predates any bound and `f48ac8e` carries the final length-keyed bound; the R1 packet/verdict artifacts are session-side, not in-repo, so this record is the surviving account of that intermediate.)_ **Backfill completed (2026-08-13 — capacity restored same-day, verified by dry-run pings at the exact invocation shapes):** Sol@max + Luna@ultra ran as retrospective assurance on the committed snapshot `f48ac8e` — **2/2 PROCEED, 5/5 checks PASS each, zero findings, zero nits**; Sol confirmed its own R1 finding resolved by the length-keyed bound + FSCROLL-4; both confirmed this §13 record preserves the gap accurately. **Residual closed**; the historical record of the incomplete R2 lineup stands unchanged. Reviewed diff = this commit minus this note and minus the disclosed comment correction. This acceptance is a **one-off recorded-gap exception** — the §6 fallback critic is NOT generalized into the standing pre-commit gate.

**M1.2e / M1.2f (2026-08-13)** — `PAUSED_FOR_REVIEW_CAPACITY` (owner ruling): production implementation deferred until the standard external lineup (Luna@max · Luna@ultra · Sol@max) is available again; planning / read-only orientation / fixture & acceptance-criteria design may proceed if the production tree stays untouched. Rationale: M1.2f is the integration regression pass — cross-slice interaction deserves the full lineup, and stacking unreviewed implementations in one tree destroys per-slice review identity. M1.2d backfill runs first when capacity returns, then M1.2e resumes under the normal gate.

**M1.2e (2026-08-13, post-backfill — normal gate restored)** — gates: `pnpm -r typecheck` · `eslint .` · `prettier --check` (slice files) · `vitest run` **804/804** (+TCOL-1..4). Cross-model review (standard lineup, one round): **Luna@max · Luna@ultra · Sol@max — 3/3 PROCEED, zero findings**, all seven charter checks PASS from all three lenses. Implementation: the `+N` affordance becomes a real toggle (expanded label `Show fewer`, `aria-expanded` both ways, collapsed accessible name `+N` preserved); new presentation-only `selectedTopics` prop (View passes canonical `state.topics`): selected topics order first in BOTH states and the collapsed budget is `max(TOPIC_LIMIT, selected)` — a selected topic can never be hidden by the collapsed state; toggle stays LOCAL `useState`, §6 untouched (TCOL-4 pins the URL through a full cycle). Browser smoke: 10-topic card 4→10→4 cycle with URL unchanged; `?topic=travel` (9th topic in repo order) renders `[travel, …]` first while collapsed with `+6` correct. Reviewed diff = this commit minus this note (doc-only, added post-verdict).

**M1.2f (2026-08-13) — integrated closure, verification-only.** Production delta **ZERO**; the diff adds only integration regression tests (INT-1..6) + this record. Gates: `pnpm -r typecheck` · `eslint .` · `prettier --check` · `vitest run` **810/810**. Integrated browser smoke (one live Chromium session, desktop 1280 + narrow 390): stuck toolbar survives facet expansion, density switch and pagination; 2236-topic facet bounded at 352px in sidebar AND drawer under the combined state; tabs stacking correct under non-default density; card topic toggle inert to a fully populated URL; no horizontal overflow (one drawer probe misfired against a stale node/wrong facet, re-probed correctly — probe artifact, disclosed). Cross-model review (standard lineup, adaptive): R1 Luna@max **FIX** + Sol@max **FIX** (six confirmed TEST-STRENGTH findings — stale-DOM-reference false-passes, a tautological ordering, unproven ready result set, an unexercised expansion, and TopicFacet's untested selected-overflow path; NO production defect, all three legs confirmed zero production delta remains correct), Luna@ultra PROCEED with the same INT-4 nit; all six fixed (re-query semantics, live-page ordering, result-set proof, real 17-topic expansion, INT-6 added). R2 on the amended tests-only diff: **3/3 PROCEED, 4/4 focused checks** — all three lenses conclude the seven-point closure matrix is established and **the milestone can close**. Reviewed diff = this commit minus this note and the status-line update (doc-only, added post-verdict).

**M1.2 milestone closure (2026-08-13):** a–f all owner-accepted under the per-slice gate (`ce91617` · `e3f30db` · `6469a62` · `f48ac8e`+`3d0f95d` · `2992f68` · this commit). The §13 charter is fully discharged: R3 effective-filter-count, density compact/comfortable, sticky toolbar (+tabs stacking), bounded facet scrolling, topic expand/collapse with selected-first pinning, and the integrated regression pass — 810 tests green, canonical §6 state untouched by any presentation feature.

### PR #239 review rounds (post-closure, pre-merge)

**Round 1 (2026-08-13, Codex xhigh on the seven-commit PR):** three findings, all confirmed by reproduction and accepted. **R1-1 (correctness, M1.2c amendment):** the stuck toolbar (bottom ≈55px, opaque, z 10) permanently covered the sticky sidebar's top 39px (`top: 1rem`) — the Language section header hit-tested to TOOLBAR; missed because jsdom tests pin structure/classes, not geometry, and the slice smoke never probed the sidebar's own sticky offset. Fixed: RepositoryView publishes the layout-dependent toolbar height as `--toolbar-h` (ResizeObserver; jsdom-guarded), the sidebar's `top`/`max-height` consume it (tabs variant mirrored); STICK-4 pins the wiring; browser re-smoke measures the clearance. **R1-2 (correctness, M1.2b amendment):** `.density-compact .card-list` silently defeated the pre-existing ≤900px single-column media rule (equal-or-higher specificity, later in source) — at 800px compact rendered 2 columns while comfortable honored 1; the CSS comment's "never fights the responsive rules" claim was false. Fixed: the column override now lives inside `@media (min-width: 901px)` (spacing stays densified at all widths), comment corrected, browser re-smoke at 800px. **R1-3 (provenance):** the M1.2d record described a `showAll`-keyed intermediate that no committed snapshot carries (working-tree-only between R1 and its fix) — a precision note now states this explicitly in the record. Gates after amendments: `vitest run` **811/811**, typecheck/eslint/prettier ✓; amendment diff reviewed by the standard three-lens lineup before commit (see the round-2 entry below once the Codex loop re-runs).

### Out of scope (→ later / M2)

- URL codec architecture; requested/effective page semantics; the 48/page constant.
- Any second view-state owner.
- M2 discovery/classification generation + provenance.
- Broad visual redesign; unrelated responsive cleanup.
