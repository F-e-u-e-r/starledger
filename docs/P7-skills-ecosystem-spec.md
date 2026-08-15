# P7 — Skills Ecosystem Spec (classification as an optional layer of the Starred view)

> Status: **M0 merged (#234); M1.1 merged (#237); M1.2 merged (#239); M2.1 merged (#240, `713b1f1`); M2.2 merged (#241, `fd9c6b5`). M2.3 in progress (deploy staging + fail-soft loader, `feat/m2.3-classification-loader`; the 2026-08-14 acceptance was SUPERSEDED on 2026-08-15 by blocker findings, and the four-loader integrity closure was absorbed into this slice — §4.10 record); M2.4–M2.5 and M3 pending.**
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

**M0 — correctness hotfix** (merged #234)

- Optional AI-annotation layer modeled as `loading | ready | unavailable`; AI-dependent filters (`categories`, `aiTags`) applied only when `ready`; base repos always preserved; degraded notice surfaced; URL retained.
- `defaultDirection(field)`: `name_with_owner → asc`, all dates/counts → `desc`. Switching the sort field resets direction to the field default (Name shows A→Z, not an inherited Z→A). (`content-visibility` is an M1 enhancement, not here.)
- Regression tests pin **three** things, not just `results.length`: (a) base repos preserved; (b) dependent facet not effective (no "· filtered"); (c) degraded state surfaced.

**M1 — browser substrate** (split into owner-reviewed sub-milestones).

**M1.1 — canonical state contract + minimal pagination proof** (merged #237) — the full §6 canonical state/codec: three new canonical fields (`view`, `density`, `page`); the decode→normalize→encode→decode round-trip extended to cover them; R1 convergence (§6.1); requested→effective page reconciliation (§6.2); page-reset on a **semantic** change to filter/search/sort/view, density exempt, explicit `page` wins (§6.3); `activeView` consolidated out of `App.tsx` into `state.view` (§6.4); and the smallest observable pagination proof — fixed **48/page**, real result slicing, minimal Prev/Next controls. Behavioral tests cover the codec, the reset matrix, reconciliation + `replace` semantics, 48/page slicing boundaries, and view fail-soft. **Not** in M1.1: any UX polish (below).

**M1.2 — browser interaction + compact-density UX** (merged #239 — per-slice acceptance records in §13) — density toggle UI + compact visual treatment, sticky toolbar, facet-scroll max-height fix, topic expand/**collapse** toggle, and R3 (effective-filter-count) convergence; `content-visibility:auto` as an enhancement only. Ordered R3 → density → sticky → facet-scroll → topic collapse → integrated regression.

**M2 — classification layer** (owner-ordered slices, 2026-08-13; each owner-reviewed like M1.2):
**M2.1** data + provenance contract (§4 normative + `@starred/skills-schema` + contract tests — no generator/loader/UI code) → **M2.2** build-time fail-closed generator (vendor the `.md`, §4/§5 → `skills-classification.json` + `-meta.json`) → **M2.3** runtime fail-soft loader + deploy staging mirroring AI/discovery → _(the separately-scheduled loader byte-integrity hotfix was ABSORBED into M2.3 on 2026-08-15 once the defect proved to invalidate M2.3's own runtime contract — §4.10)_ → **M2.4** UI projection (Skills-ecosystem scope + Skill-category facet + card badges + search enrichment + `.md` download + 3-number coverage line) → **M2.5** integrated closure (verification-only target, production delta 0 ideal — the M1.2f pattern). Later: group-by-primary view mode.

**M3 — identity** — ledger+star mark in the header, `--accent`/`currentColor`; `/favicon.svg` asset (owner prefers a real asset over a `data:` URI — inspectable, cacheable, PWA-ready; NIT, non-blocking).

---

## 4. Data contract (M2 — formalized as the M2.1 slice)

> **M2.1 (2026-08-13, `feat/m2.1-classification-contract`):** this section was expanded from the design-consult draft into the normative contract, with an executable form — `@starred/skills-schema` (Zod schemas + invariants + canonical serializers) → generated JSON Schemas + contract tests — landed BEFORE any generator/loader/UI code. M2.2 (generator), M2.3 (loader), M2.4 (UI projection) implement against this section and change it only by amendment.

### 4.0 Files, naming, ownership

| File                                                                                                                                  | Role                                                                                                                                                                                                                                              | Location                      |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `skills-classified.md`                                                                                                                | vendored curated source (owner-authored)                                                                                                                                                                                                          | repo root (vendored in M2.2)  |
| `skills-aliases.json`                                                                                                                 | human-reviewed durable alias map (§4.7, §5)                                                                                                                                                                                                       | repo root; absent ⇒ empty map |
| `skills-classification.json`                                                                                                          | generated classification artifact                                                                                                                                                                                                                 | repo root                     |
| `skills-classification-meta.json`                                                                                                     | generated provenance/integrity metadata                                                                                                                                                                                                           | repo root                     |
| `schemas/skills-classification.schema.json` · `schemas/skills-classification-meta.schema.json` · `schemas/skills-aliases.schema.json` | **structural projections** generated from the Zod source of truth — `.refine`/`.superRefine` rules do not translate, so these are NOT complete validators (each carries a `$comment` saying so); the Zod schemas are the only complete validators | `schemas/`                    |

- **Location — D1 RATIFIED (owner, 2026-08-13):** M2 classification artifacts live at repository root, alongside the existing canonical generated artifacts; the earlier `data/` prefix in the design draft is superseded by this section. Rationale (owner): the root artifact path is the repository's actual integration contract (existing canonical artifacts, deploy staging, filename constants all root-based); a classification-only directory-aware deploy/loader path would smuggle a product-value-free deployment migration into a contract slice; artifact location is operational packaging, not classification semantics. **A future move under `data/` is an explicit artifact-layout migration** (deploy + loader + compatibility together), never an incidental M2 generator change.
- **Naming:** every M2 identifier carries a `skills-` / `Skills` prefix — never bare "classification", which P3's executor artifacts already occupy (`classification-{candidate,job,manifest}.schema.json`). Zero collision by construction.
- **Ownership:** the contract lives in `@starred/skills-schema`, deliberately SEPARATE from `@starred/ai-schema` with zero imports in either direction (§11 M2 action item). Meta field names deliberately differ from `ai-annotations-meta.json` — `classification_sha256` (not `annotations_sha256`), `generated_against_stars_sha256` (not `dataset_sha256`) — so the AI loader's hard dataset gate can never be cargo-culted onto this layer: the names themselves encode the §2.1 semantics.

### 4.1 Identity model (three identities, not one)

1. **Record identity** = `source_name_with_owner` — the name the `.md` classified, case-insensitively unique across entries (I-1). Historical/diagnostic only; never displayed as live repo data.
2. **Join identity** = `node_id` — unique across the entries that carry one (I-2); the ONLY key the runtime join uses (§5).
3. **Category identity** = category `id` slug — unique (I-5 domain); entries reference categories by id only (I-4).

`resolution` binds 1↔2 (I-3): `"resolved"` ⟺ `node_id` non-null; `"missing_from_stars"` ⟺ `node_id: null` (the entry is retained + surfaced, §5 — an unresolved entry keeps record identity while having no join identity).

### 4.2 Artifact contract — `skills-classification.json`

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

_(The jsonc above is schematic — e.g. the sample entry references a category the truncated `categories` array does not show; it is not a complete I-4-valid instance. The contract tests carry the canonical valid fixtures.)_

**Field rules** (every object `.strict()` — an unknown field is a schema violation; the closed field set IS the contract):

- **root:** `schema_version` literal `"1.0"` · `taxonomy_version` literal `"skills-1"` · `scope` · `categories` · `entries`. **No timestamp anywhere in the artifact** — wall-clock is quarantined in meta `generated_at` (mirrors the stars dataset's determinism invariant).
- **scope:** `id` slug 1–64 · `label` 1–120 · `description` 1–400.
- **category:** `id` slug (`^[a-z0-9]+(-[a-z0-9]+)*$`, 1–64) · `label` 1–120 · `kind` ∈ `domain | infrastructure` · `definition` 1–600 · `order` int ≥ 0 · `target_pack` ∈ `opus-pack | design-pack | null` (**D2 RATIFIED** — a controlled classification vocabulary, not a user-generated label: a free slug would defer typo/unknown-pack/consumer-miss failures downstream, against the build-time fail-closed direction; the expansion path is §4.6).
- **entry:** `source_name_with_owner` — exactly one `/`, no whitespace, 3–140 · `node_id` string 1–256 or null (control-character-free; NO format regex — GitHub ships both legacy `MDEw…` and `R_…` ids, same policy as `CanonicalRepoSchema`) · `resolution` ∈ `resolved | missing_from_stars` · `primary_category_id` · `secondary_category_ids` · `summary` 1–400.
- **free text** (`label`/`definition`/`summary`/scope fields): NFC-normalized, single-space collapsed, no C0/C1/DEL controls, no Unicode format characters (the full `Cf` category — bidi controls, zero-width chars, soft hyphen, invisible operators, tag block) **except U+200C/U+200D (ZWNJ/ZWJ)** — legitimate in Arabic/Persian shaping and emoji sequences, the same deliberate exception as the AI scalars. **Identity scalars (`node_id`, `source_name_with_owner`) get NO exception**: every format character is rejected there, so a joiner-disguised near-duplicate identity fails loudly. **URLs are NOT rejected** (deliberate difference from the AI scalars: this source is owner-curated, not attacker-influenceable, and every consumer renders it as plain React text children; any consumer that linkifies or embeds in href/src MUST re-open this control).
- entries never carry stars/url/language/description — those come exclusively from the live `node_id` join (the strict schema makes carrying them a violation, not a convention).
- **`resolution` IS the machine-readable unresolved reason.** §5's "unresolved names + reasons" is satisfied by: the name (`source_name_with_owner`, always retained), the machine reason (`resolution: "missing_from_stars"` — the only unresolved cause v1 has), and human context where an id was manually recovered (`skills-aliases.json` `reason`, §4.7). The artifact carries no free-text per-entry note field; richer narrative (rename hypotheses, investigation notes) lives in the spec/alias map, not the generated artifact.

**Structural invariants** (in the Zod schema via `superRefine`, so generator output AND loader input are both held to them):

| ID  | Invariant                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| I-1 | `source_name_with_owner` unique case-insensitively                                                                                                |
| I-2 | non-null `node_id` unique                                                                                                                         |
| I-3 | `resolution === "resolved"` ⟺ `node_id !== null` (both directions)                                                                                |
| I-4 | every `primary_category_id` / `secondary_category_ids[i]` references an existing category; secondaries: ≤ 1 (v1), each ≠ primary, sorted + unique |
| I-5 | `categories` sorted by `order`; the `order` values are exactly `0..n-1` (a permutation — no gaps, no duplicates); category `id`s unique           |
| I-6 | `entries` sorted by `source_name_with_owner.toLowerCase()`, codepoint order (total order because of I-1; no locale collation)                     |

### 4.3 Determinism & canonical serialization

- The generator is a **pure function**: `(skills-classified.md bytes, skills-aliases.json bytes | absent, prior skills-classification.json bytes | absent, stars.json bytes) → (artifact bytes, meta minus generated_at)`. Determinism is stated PER ARTIFACT so no test author over- or under-reads it: the **classification data artifact** is deterministic and canonical-byte stable for identical inputs; the **meta artifact** is deterministic in every field EXCEPT `generated_at` — the sole intentionally non-deterministic field (wall clock, meta-only) — so meta JSON is NOT required to be byte-identical across runs, while all of its provenance-bearing input fingerprints are. **Every input that can determine a `node_id` is fingerprinted in meta** (`source_sha256`, `aliases_sha256`, `prior_classification_sha256`, `generated_against_stars_sha256` — §4.4), so an alias- or prior-recovered id has an auditable lineage.
- Canonical bytes: fixed key order (schema declaration order, explicit canonicalizers — never object-construction order), I-5/I-6 ordering, 2-space indent, single trailing newline (`JSON.stringify(canonical, null, 2) + '\n'` — the same recipe as every other canonical artifact in this repo).
- Because the ordering invariants live in the schema (not just the serializer), a hand-edited artifact that drifts from canonical form fails schema validation and therefore **fails soft at runtime** — it never renders shuffled.

### 4.4 Meta contract — `skills-classification-meta.json` (generator-owned)

```jsonc
// skills-classification-meta.json
{
  "schema_version": "1.0",
  "taxonomy_version": "skills-1",
  "classification_sha256": "<sha256 of the exact JSON bytes>", // integrity gate (runtime verifies)
  "source_sha256": "<sha256 of the .md>", // provenance
  "aliases_sha256": "<sha256 of skills-aliases.json>", // provenance; null ⟺ file absent (empty map)
  "prior_classification_sha256": "<sha256 of the prior artifact>", // provenance; null ⟺ no prior consumed (first generation, or an explicit regenerate-without-prior run — §4.6)
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

_(Count values above are illustrative, carried from the §5 authoring-snapshot analysis; M2.2 computes real values at generation time.)_

| Field                            | Semantics                                                                                                                                             | Runtime role                                                                      |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `classification_sha256`          | sha256 of the exact artifact bytes                                                                                                                    | **integrity gate** — loader verifies bytes before parsing                         |
| `source_sha256`                  | sha256 of the vendored `.md` bytes                                                                                                                    | provenance only                                                                   |
| `aliases_sha256`                 | sha256 of `skills-aliases.json`; null ⟺ file absent (empty map)                                                                                       | provenance only — input lineage for alias-recovered ids                           |
| `prior_classification_sha256`    | sha256 of the prior artifact consumed for sticky resolution; null ⟺ NO prior consumed (first generation, or the §4.6 regenerate-without-prior escape) | provenance only — input lineage for prior-recovered ids                           |
| `generated_against_stars_sha256` | stars snapshot the generation ran against                                                                                                             | **provenance only** (§2.1) — soft "older snapshot" note when ≠ live, never a gate |
| `generated_at`                   | UTC wall clock of generation                                                                                                                          | display/provenance                                                                |
| 8 count fields                   | generation-time snapshot statistics                                                                                                                   | diagnostics; internal consistency is verified, live re-check is forbidden         |

**Count semantics** (four disjoint entry states): _resolved_ = has `node_id`; _unresolved_ = `missing_from_stars`; among resolved, _present_ = `node_id` existed in the generation-snapshot stars, _absent_ = it did not (a resolved-but-unstarred repo — e.g. an alias-recovered id whose repo was later unstarred). `unclassified_repo_count` = snapshot repos with no classification.

**Cross-invariants:**

| ID  | Invariant                                                              | Build (generator)             | Runtime (loader)                                             |
| --- | ---------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------ |
| C-1 | `category_count == categories.length`                                  | assert                        | verify                                                       |
| C-2 | `source_entry_count == entries.length`                                 | assert                        | verify                                                       |
| C-3 | `resolved_entry_count == count(resolution == "resolved")`              | assert                        | verify                                                       |
| C-4 | `unresolved_entry_count == count(resolution == "missing_from_stars")`  | assert                        | verify                                                       |
| A-1 | `source_entry_count == resolved_entry_count + unresolved_entry_count`  | assert                        | verify (meta-internal arithmetic)                            |
| A-2 | `resolved_entry_count == present_repo_count + absent_repo_count`       | assert                        | verify (meta-internal arithmetic)                            |
| A-3 | `present_repo_count + unclassified_repo_count == canonical_repo_count` | assert against snapshot stars | verify arithmetic only — **never against live stars** (§2.1) |

### 4.5 Failure-mode boundary — build fail-closed, runtime fail-soft

The generator (M2.2) is **fail-closed**: it refuses to emit an artifact from a defective source. The loader (M2.3) is **fail-soft**: nothing in this layer may degrade the base Starred browser (§2.2 contract, same `loading | ready | unavailable` model as the AI layer).

| Condition                                                                      | Build-time (generator)                                                              | Runtime (loader)                                                            |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| source `.md` unparsable / malformed entry                                      | **FAIL** (named line/entry)                                                         | n/a — runtime never reads the `.md`                                         |
| `stars.json` missing / unreadable / schema-invalid (build input)               | **FAIL** — no resolution basis                                                      | n/a — see the loading row below for the live dataset                        |
| `skills-aliases.json` present but unreadable / schema-invalid                  | **FAIL** (absent is NOT a failure — empty map, `aliases_sha256: null`)              | n/a — runtime never reads the alias map                                     |
| prior artifact present but unreadable / fails the CURRENT schema               | **FAIL** — see §4.6 (named regenerate-without-prior escape; never silently dropped) | n/a                                                                         |
| fetch failure / non-2xx / invalid JSON on `skills-classification{,-meta}.json` | n/a                                                                                 | layer `unavailable` (while in flight: `loading`); base browser unaffected   |
| schema violation (unknown field, bounds, enum)                                 | **FAIL**                                                                            | layer `unavailable`; base browser unaffected                                |
| duplicate record identity (I-1) / join identity (I-2)                          | **FAIL**                                                                            | schema-invalid ⇒ `unavailable`                                              |
| resolution conflict (§5 — distinct candidate `node_id`s for one entry)         | **FAIL** (named conflict)                                                           | n/a — resolution is build-time only                                         |
| count/cross-invariant mismatch (C-1..4, A-1..3)                                | **FAIL**                                                                            | `unavailable`                                                               |
| meta missing / malformed / hash length invalid                                 | **FAIL** (never emit artifact without meta)                                         | `unavailable`                                                               |
| `classification_sha256` ≠ fetched artifact bytes                               | n/a (generator computes it)                                                         | `unavailable` (integrity gate)                                              |
| `generated_against_stars_sha256` ≠ live `stars_sha256`                         | n/a                                                                                 | **still `ready`** + soft provenance note (§2.1 — never a gate)              |
| entry `node_id` not in the **generation-snapshot** stars                       | counted `absent` (not a failure)                                                    | n/a — a build-time statistic (§4.4)                                         |
| entry `node_id` not in the **live** stars (orphan classification)              | n/a — build never sees the future dataset                                           | join miss ⇒ that classification simply doesn't surface; layer stays `ready` |
| live repo with no classification                                               | counted `unclassified` (against its snapshot)                                       | renders fully, no badges — "absence is not a classification"                |
| unresolved entries present                                                     | retained + counted (not a failure)                                                  | no effect on the layer; surfaced in coverage diagnostics only               |
| `schema_version` / `taxonomy_version` ≠ the literals this build knows          | **FAIL**                                                                            | `unavailable` (see §4.6)                                                    |

The M0 requested/effective distinction applies unchanged: a URL carrying a skill facet while the layer is not `ready` keeps the requested value, deactivates the filter, and surfaces the degraded notice (§2.2) — M2.4 wires this; the contract here only fixes which conditions produce which layer state.

### 4.6 Versioning

- `schema_version` (artifact + meta move together) governs **shape**: `MAJOR.MINOR`; additive/compatible → MINOR, breaking → MAJOR. `taxonomy_version` (`skills-1`) governs **meaning**: bump when the category vocabulary is re-cut such that old and new category ids are not comparable.
- **Controlled-vocabulary expansion (D2 rollout, owner-accepted friction):** adding a `target_pack` value is an **explicit rollout event**, never data drift — `schema vocabulary change → schema MINOR bump → generator/tests update → compatible loader/consumer update`. The cost is paid once per genuine taxonomy expansion instead of on every record; under the literal-match loader policy above, a new enum value could never be half-adopted silently anyway.
- **v1 loader policy: literal match** — any `schema_version` or `taxonomy_version` the loader does not know ⇒ `unavailable` (fail-soft), never a crash, never a partial parse. Rationale: artifact and dashboard bundle deploy from the same repo in the same publish, so version skew exists only at CDN-cache edges for minutes; literal match buys zero-ambiguity at near-zero cost. Revisit (minor-tolerant decode) only if artifacts ever deploy independently of the bundle.
- **Prior artifact across a schema bump:** the generator reads the prior artifact under the CURRENT schema (§5 step 3). A prior that fails it — including one written under an older `schema_version` — is a **build FAILURE**, never a silent `null`: silently dropping the prior would silently lose sticky resolutions (a renamed repo's entry quietly degrades to `unresolved` and the counts drift). The named escape is an explicit operator action — regenerate without prior via a dedicated flag, or migrate the prior first. M2.2 implements the flag. In the §4.3 determinism model the flag simply selects the prior-absent input case (`prior_classification_sha256: null` — the same "no prior consumed" meaning §4.4 defines), so bypass runs stay deterministic and honestly fingerprinted.

### 4.7 Alias map contract — `skills-aliases.json`

The §5 resolution step (2) needs a durable, human-reviewed shape:

```jsonc
// skills-aliases.json (hand-maintained, human-reviewed — never generator-written)
{
  "schema_version": "1.0",
  "aliases": [
    {
      "source_name_with_owner": "jacob-bd/notebooklm-mcp-cli", // as written in the .md
      "node_id": "R_…", // the manually confirmed live repo id
      "reason": "renamed to jacob-bd/gemini-notebook-mcp-cli; confirmed by owner 2026-08-…",
    },
  ],
}
```

- `.strict()`; `source_name_with_owner` unique case-insensitively; `node_id` unique, same scalar rules as entries; `reason` required, 1–400, same free-text discipline. File absent ⇒ empty map (not an error). The generator READS this file; only a human writes it (§5: added only after manual confirmation).

### 4.8 M2.1 acceptance (contract slice)

- **Deliverable:** this §4 as the normative contract; `@starred/skills-schema` implementing it 1:1 (schemas, invariants I-1..I-6 + C-1..4/A-1..3, canonical serializers, version literals); `pnpm schemas` emitting the three JSON Schemas; contract tests exercising every invariant from both directions (accept the canonical form, reject each named violation) plus byte-determinism of both serializers.
- **Explicitly NOT in M2.1** (deferred to M2.2+): the `.md` parser, resolution engine, count computation against stars, any CLI, any loader/fetch code, any dashboard/UI change, vendoring `skills-classified.md` itself.
- Gates: `pnpm -r typecheck` · `eslint .` · `prettier --check` (changed files) · `vitest run` (suite green incl. new contract tests) · generated schemas committed in the same change as the Zod source.

**M2.1 record (2026-08-13)** — final gates: `pnpm -r typecheck` · `eslint .` · `prettier --check` (changed files) · `vitest run` **935/935** (+124 contract tests over the 811 baseline; suite trajectory 913 at authoring → 931 after round-1 fixes → 935 after round-2 fixes: artifact ACC/strict/enums/I-1..I-6/DET incl. golden canonical bytes and a codepoint-vs-code-unit ordering pin, meta schema/A-in-schema/C-C-A/serializer incl. fail-closed negatives and golden bytes, scalars incl. C1/Cf/joiner boundary cases, aliases) · coverage above the global floors 80/75/78/80 · `pnpm schemas` emits the three `skills-*` structural projections byte-stably. Production dashboard delta: **zero** (contract package + spec + generated schemas + workspace wiring only). Owner decision points recorded at authoring — **both RATIFIED (owner ruling 2026-08-13):** D1 root location (§4.0, with the future-move-is-a-migration clause), D2 `target_pack` closed enum (§4.2, expansion path §4.6). **M2.1 ACCEPTED (owner, 2026-08-13)** — the accepted-state deltas beyond R3 are the two ratification texts, the §4.3 per-artifact determinism wording split (owner precision request: meta JSON is NOT byte-identical across runs, only its fingerprints are), and this acceptance note — doc-only, author-side diff-checked per the evidence-only rule. Bounds stay a recorded residual: M2.2's first real-corpus ingestion adjusts them on corpus evidence + tests if legitimate content exceeds them — never by silent parser truncation.

Cross-model review (standard lineup Luna@max · Luna@ultra · Sol@max, adaptive): **R1 3/3 FIX — 13 deduplicated findings, all reproduced and fixed** (input-lineage hashes `aliases_sha256`/`prior_classification_sha256` added to §4.4; §5 rewritten to the executable evaluate-all resolution rule with auxiliary-input edges pinned; §4.5 completed with runtime transport/parse and build-side input rows + the snapshot-vs-live orphan split; character policy reconciled — full-`Cf`+C1 rejection, ZWNJ/ZWJ exception scoped to free text only, identity scalars exception-free; I-6 comparator moved to true codepoint order with a supplementary-plane regression pin; generated JSON Schemas declared structural projections with an embedded `$comment`; meta serializer made parse-first fail-closed; "unresolved reasons" closed by contract precision — `resolution` is the machine reason, alias-map `reason` carries human context, no new artifact field; plus three test-strength repairs — a doubly-invalid strictness fixture, golden exact-byte serializer pins, out-of-enum negatives). **R2 3/3 FIX — convergent small round:** two real residuals fixed (`prior_classification_sha256: null` semantics unified to "no prior consumed" across §4.4/§4.6/code, per Sol+Luna@ultra; A-1..A-3 moved INTO the meta schema so the serializer is fail-closed against impossible counts, per Sol — pinned by new negatives), this record's staleness fixed (all three legs), and one finding **rejected-with-reason**: "pnpm-lock importer missing" — the lockfile importer delta exists in the working tree (+9 lines, zod deps at already-resolved versions); both packets excluded the lockfile from the inlined diff and only R1's context note said so — a packet-framing artifact, not a tree defect. **R3 (round cap) 3/3: every R1/R2 fix confirmed present, the lockfile disposition accepted; sole residual = this record's own suite figure lagging the R2 fixes' +4 tests (931 → 935) — refreshed above as an evidence-only doc delta with an author-side diff check, no re-run (the M1.2 evidence-only rule).**

---

### 4.9 M2.2 source grammar (owner ruling 2026-08-14 — option B: strict annotated-source grammar)

The vendored markdown is **source evidence and stays verbatim** — cleaning it to make the parser easier would blur "what the source says" into "what the generator wants", and future upstream edits could no longer be told apart from our own normalization. The parser therefore owns an explicit, **exhaustively enumerated** source→semantic normalization. This is an M2.2 parser-grammar clarification, **not** an M2.1 vocabulary amendment: the generated `target_pack` stays exactly the D2 closed enum `opus-pack | design-pack | null`.

**Target-pack source grammar (whitelist — complete forms only):**

```text
target-pack-source ::=
    "opus-pack"
  | "design-pack"
  | "opus-pack (to be split out later)"
```

**Semantic projection:**

```text
"opus-pack"                          → target_pack = "opus-pack"
"design-pack"                        → target_pack = "design-pack"
"opus-pack (to be split out later)"  → target_pack = "opus-pack"
(column value "-" / no header annotation) → target_pack = null
```

`(to be split out later)` is a **source-only editorial marker**: it has no classification semantics, it is not a third `target_pack` value, it never reaches the generated record, and it is accepted ONLY in the exact form above — its removal is a **documented normalization, not a silent discard**. Anything else is a generator error, fail-closed — explicitly including `opus-pack foo`, `opus-pack (later)`, `opus-pack(to be split out later)` (missing space), `Opus-Pack`, `design-pack (something)`, `opus-pack (to be split out later) extra`. No trim/startsWith/leading-token parsing, ever.

**Source structure the parser accepts (anything else fails, named):** the category-scheme tables are the CANONICAL category source (label, definition, declared count, target-pack-source; domain table then infrastructure table — `order` is table appearance order 0..n-1); category sections `## <Label> (<count>)` with the first four domain sections optionally carrying `— target pack: **<target-pack-source>**`; entry bullets `- <owner/name> (★<count>) — <summary>` — `<count>` is plain digits or standard comma-grouped thousands (`\d{1,3}(,\d{3})*`), the corpus's actual form; it is source-only, read and discarded (entries never carry stars, §4.2) — with an optional `[secondary: <Label>]` suffix; the `## Multi-fit repos (primary / secondary)` table as a REDUNDANT view.

**Cross-validation obligations (source self-consistency; any mismatch = generator error):** section-header pack ↔ scheme-table pack; section italic definition line ↔ scheme-table definition; section declared count ↔ actual entry count; scheme-table counts ↔ subtotals ↔ the total line; the multi-fit table ↔ the entries' `[secondary:]` markers (both directions, and its row count ↔ the number of secondary-carrying entries).

**Category id derivation (slug):** lowercase the label → replace every run of non-`[a-z0-9]` characters with a single `-` → trim leading/trailing `-`. E.g. `Verification & QA` → `verification-qa`; `Design (UI/UX & Visual/Motion)` → `design-ui-ux-visual-motion`; `Roadmap & Spec-Driven Planning` → `roadmap-spec-driven-planning`. Derived ids must be unique (I-5 then holds structurally).

**Scope constant:** the artifact `scope` is a generator constant (`coding-agent-skills-ecosystem` / label / description exactly as the §4.2 example) — the source file carries no scope block.

**Generator gates (owner-locked at GO, 2026-08-14; each pinned by a named test in M2.2):**

1. The parser performs NO generic cleanup — only contract-documented normalization (the annotation above; NFC/whitespace canonicalization of free text per §4.2); no tolerant guessing.
2. Resolution is genuinely evaluate-all: every candidate collected BEFORE adjudication — never a precedence loop returning on first match (§5).
3. `prior_classification_sha256 = null` ⟺ the prior input was consumed not at all; if the prior participated in resolution, the run is lineage-bearing even when the output happens to equal a no-prior run.
4. `--regenerate-without-prior` is an explicit mode — a prior load failure is NEVER swallowed into a silent fallback (§4.6).
5. Determinism verified per artifact: exact-byte golden for the data artifact; meta verified with a fixed injected clock or by excluding `generated_at` — never by requiring two real runs' meta bytes to match (§4.3).
6. Snapshot/report counts are DERIVED from the validated resolved records — no separately maintained counters to drift.

**M2.2 record (2026-08-14, `feat/m2.2-classification-generator`)** — deliverable: `skills-classified.md` vendored byte-exact (sha256 `495da0c0…`); `@starred/skills-generator` (strict §4.9 parser + evaluate-all resolution + generation + `stars-skills-classify` CLI incl. `--regenerate-without-prior` and `--dry-run`); first-generation artifacts landed (`skills-classification.json` + `-meta.json`: 24 categories · 171 entries · 166 resolved/present · 0 absent · **5 unresolved** · 744 canonical · 578 unclassified — the 5, retained + surfaced per §5: `AgentWrapper/agent-orchestrator`, `jacob-bd/notebooklm-mcp-cli` (both already named in §5), `nowork-studio/NotFair`, `rolandwonglonam/rw-research-skill`, `vinhhien112/Three.js-Object-Sculptor-Codex-Plugin` (697→744 drift); alias-map recovery stays a later human step). Gates: `vitest run` **1026/1026** (+91 generator tests over M2.1's 935) · typecheck/eslint/prettier clean · coverage over the global floors. **Determinism, stated precisely (gate 5):** the DATA artifact is exact-byte deterministic — golden end-to-end bytes pinned in tests, and real CLI reruns byte-identical (`cmp`) through every parser-strictification round; META is verified with an injected fixed clock (identical inputs+clock ⇒ identical bytes; different clock ⇒ only `generated_at` differs) — real-run meta byte-equality is neither required nor claimed. All six §4.9 gates carry named tests, incl. the gate-3 trap (a consumed prior whose output equals a no-prior run still records its hash) and the gate-4 edges (exists-but-unreadable prior via a directory, dangling symlink, lstat-failure — all fatal, never a silent no-prior fallback). Owner checkpoints: real corpus 171/24 parses clean under the fully strict grammar; evaluate-all proven non-short-circuit by conflict tests a first-match walk cannot pass. Cross-model review (standard lineup, adaptive, cap 3): **R1 3/3 FIX** (5 findings: trimEnd/cell-trim generic cleanup; loose ★count regex; fail-open structure; an overbroad byte-identity claim in the review packet itself — clarified, no code change; untested gate-4 CLI wiring) → **R2 3/3 FIX** (6 fixed: marker spacing, typed subtotals + total ordering, exact verification closer + tail zero-tolerance + prose-zone data-bearing guards, required position-checked dividers, dangling-symlink prior, parser-level name diagnostics; 1 **rejected-with-reason**: "packs restricted to the first four sections" — a corpus description, not a grammar rule; the enforced invariant is section↔scheme pack equality) → **R3 3/3 FIX (round cap): 3 residuals, all reproduced and fixed post-cap** — reserved `[secondary:` marker can no longer degrade to prose (malformed/repeated forms are named violations), `lstat` failures other than ENOENT are fatal, scheme tables close after their subtotal/the total line — each pinned by a regression test, suite 1022→1026, artifact still byte-identical. **Recorded gap and its closure (2026-08-14):** the three R3 fixes occurred after the round-3 cap, so the owner ordered an **R4 standard-lineup assurance of the amended final tree** (ruling: the M1.2d exception does not generalize; a cap is a cost control, not a correctness cap). R4: Luna@max PROCEED; Luna@ultra + Sol@max converged on **one real test-strength finding** — the lstat fix had no regression pin (no test drove "read ENOENT → lstat non-ENOENT"; a reverted catch-all would have passed every test, failing assurance check 4). Adaptive per policy: reproduced → fixed (`readOptional` extracted to its own module with an injectable io seam, since a real filesystem cannot stage ENOENT-then-EACCES deterministically; cli.ts behavior unchanged) → pinned (5 new tests incl. the injected-io EACCES fatal case that fails on the pre-fix catch-all; suite 1026 → **1031/1031**) → **focused R5 on the amended tree: 3/3 PROCEED** (pin confirmed genuine, no real-filesystem behavior drift, no refactor defect). **Residual closed.** The R3-era record above stands unrewritten; the data artifact remained byte-identical throughout.

### 4.10 M2.3 runtime contract — deploy staging + fail-soft loader (owner-scoped 2026-08-14)

**Scope:** deploy staging for the two classification artifacts (root-filename convention, the AI/discovery fail-soft stage pattern) + the runtime loader with the M0 `loading | ready | unavailable` availability state + a `node_id`-keyed runtime representation. **OUT (M2.4+):** facets, Skills-ecosystem scope UI, badges, classification filtering; **never:** aliases heuristics at runtime, generator changes (absent a demonstrated M2.3 contract bug). Production observable UI delta ≈ 0 — classification data may EXIST at runtime but must not yet influence browser semantics.

**Four locked decisions (owner):**

1. **`loading ≠ unavailable`** (the verified M0 model): from initialization until artifact resolution completes the layer is `loading`; `unavailable` only after a definitive failure. Loading is never rendered as permanent degradation.
2. **Fail-soft, but validation never fail-open:** an invalid artifact rejects the ENTIRE optional layer (`unavailable`) — no per-record try/catch, no "salvage what parses" partial `ready`. The artifact is a generated, validated whole; runtime either accepts it under the full contract or not at all. Base Starred is unaffected either way.
3. **Provenance stays provenance at runtime:** `generated_against_stars_sha256` is never compared against the live dataset as a validity/freshness gate (§2.1). Structurally guaranteed in M2.3: the loader's only inputs are the two skills files — it has no stars hash in hand to gate on. The value is exposed on the loaded result for M2.4's soft provenance note; the loader itself draws no conclusion from it.
4. **The loader never touches the 5 unresolved:** it loads exactly the resolved records the generator emitted; unclassified repos are ordinary base repos; no runtime name-matching, alias guessing, or resolution completion.

**Runtime validation (in order, any failure ⇒ `unavailable`):** meta fetch + strict schema (incl. literal `schema_version`/`taxonomy_version`) → sha-busted artifact fetch → byte integrity (`classification_sha256` over exact bytes) → artifact strict schema incl. I-1..I-6 → `checkSkillsMetaConsistency` (C-1..C-4 + A-1..A-3; stars-independent by construction) → build the `node_id → classification` map from resolved entries.

**M2.3 acceptance matrix (each row pinned independently):**

| Condition                                       | Layer state                                               | Base browser |
| ----------------------------------------------- | --------------------------------------------------------- | ------------ |
| valid data + valid meta                         | `ready`; records addressable by `node_id`                 | unaffected   |
| data artifact missing                           | `unavailable`                                             | unaffected   |
| meta missing                                    | `unavailable`                                             | unaffected   |
| data malformed (JSON or schema)                 | `unavailable` — **no partial salvage**                    | unaffected   |
| meta malformed                                  | `unavailable`                                             | unaffected   |
| unsupported `schema_version`/`taxonomy_version` | `unavailable`                                             | unaffected   |
| network/read failure                            | `unavailable`                                             | unaffected   |
| load still in flight                            | **`loading`** — never mislabeled `unavailable`            | unaffected   |
| `generated_against_stars_sha256` ≠ live         | per §2.1: NOT a gate; value exposed, no loader conclusion | unaffected   |
| repo without classification                     | normal repo — no error, no synthetic classification       | unaffected   |

**M2.3 record (2026-08-14, `feat/m2.3-classification-loader`)** — deliverable: `stageSkillsArtifacts` (fail-soft pair staging with ownership-safe temp-file protocol: per-invocation `randomUUID` temp names + `COPYFILE_EXCL` + created-list-only cleanup; destination pre-checks; pre-existing dist pairs survive any failed re-stage byte-for-byte) wired into the deploy CLI; `loadSkillsClassification` (meta → sha-busted fetch → mandatory byte integrity, no bypass on the surface → whole-artifact strict schema, no partial salvage → `checkSkillsMetaConsistency` → node_id-keyed map; provenance value exposed, structurally ungateable — the loader holds no stars hash); `useSkillsClassification` (M0 three-state model; idempotent loading-reset so an unstable loader cannot drive a synchronous effect loop; sync-throws routed to rejection); App wiring with **production UI delta = 0** (the hook runs, nothing consumes it until M2.4; pinned by DOM byte-equality across ready/pending/unavailable/rejecting/unclassified-repo arms after useId normalization, plus a counting-loader wiring pin). All ten §4.10 matrix rows carry independent tests. Gates: `vitest run` **1066/1066** (+32 over M2.2's 1034: 13 loader, 6 hook, 3 App, 9 staging, 1 CLI-wiring) · typecheck/eslint/prettier clean · coverage above the global floors. Cross-model review (standard lineup, adaptive, cap 3 + owner's post-cap assurance policy): **R1 3/3 FIX — 7 findings, all reproduced and fixed** (public `verifyBytes` integrity bypass removed — the AI loader's identical pre-existing option is LOGGED as a sibling for the owner, deliberately untouched in this slice; independent meta-missing + read-rejection rows; an arithmetic-consistent consistency mutation so only the cross-check can catch it; hook loading-reset + sync-throw routing; staging partial-pair rollback; App wiring/DOM-equality pins; deploy CLI integration test). **R2 3/3 FIX — 2 findings** (rollback could destroy a pre-existing dist pair → temp-file staging; matrix row 10 App-level arm). **R3 (cap) 2/3 PROCEED + 1 real test-strength finding** (the L1 pin's failure injection sat in the validation read, so the destructive implementation also passed it) → fixed post-cap per the owner's M2.2 policy: staging-phase injection with a documented discrimination argument, plus a cleanup defect the old pin masked (EISDIR escape) → **focused R4: pin confirmed discriminating, 3/3 converged on one further real defect** (fixed-name temporaries could overwrite/delete a foreign regular file) → ownership-safe protocol above + foreign-file survival regressions → **focused R5: 2/3 PROCEED; Sol's residual (a partial temp left only if BOTH a mid-copy I/O failure AND libuv's own error-path unlink fail) adjudicated `rejected-with-reason`:** the hypothetical residue is a uniquely-named inert file with zero correctness impact (never collides, never staged, never mistaken for foreign), and the proposed manual-descriptor rewrite adds more surface than it removes — **owner ruling 2026-08-14: UPHELD**, residual formally accepted with a boundary attached (acceptance note below). Incidental fixes disclosed during rounds: a never-settling test promise stalling the vitest worker; the synchronous effect-loop diagnosis behind the idempotent reset.

**M2.3 owner acceptance (2026-08-14) — ACCEPTED / COMMIT-READY. → SUPERSEDED 2026-08-15** by the amendment record at the end of this section; retained verbatim as the historical verdict, never as a current claim. Two of the properties it certifies were later falsified by executable evidence. Verified at acceptance: runtime contract · deploy staging · pre-existing canonical pair preservation · foreign-file ownership · strict whole-artifact loader · mandatory integrity verification · `loading | ready | unavailable` · production UI delta 0 · suite 1066/1066 · static gates · R1–R5 adaptive convergence · Sol residual adjudicated. **The review gate CLOSES at R5** — 2 PROCEED plus one finding objectively adjudicated non-blocking; an R6 run whose only purpose would be to reach a 3/3 vote count is explicitly NOT required, because the verdict is adjudicated, not counted. Owner disposition of the R5 Sol residual, verbatim:

```text
R5-Sol residual:
REJECTED-WITH-REASON as a correctness blocker.

Accepted residual:
an exceptional double-I/O-failure may leave an inert,
uniquely owned temporary file.

It cannot become a staged artifact, cannot collide with a later
invocation, and cannot damage a pre-existing canonical pair.

Classification: operational hygiene NIT, not M2.3 correctness.
```

**Boundary carried with that acceptance (owner, load-bearing — do not "tidy").** This NIT is never to be closed later by a broad glob/sweep cleanup of the staging directory: a pattern-matching sweep is exactly how the R4 foreign-file ownership defect re-enters, and an inert uniquely-named temp is cheaper than a cleaner that can delete a file it does not own. If debris accumulation is ever actually OBSERVED (not hypothesized), the remedy is an ownership-provable cleanup mechanism designed and reviewed as its own change. The rejected alternative stays rejected on the recorded reasoning: a manual file-descriptor rewrite adds close/fsync/error-unwind correctness surface disproportionate to a residue with no correctness consequence.

**Sibling defect disposition (owner ruling 2026-08-14) — scheduled, NOT folded into M2.4.** The AI loader (`apps/dashboard/src/data/load-annotations.ts`) carries the same pre-existing public `verifyBytes` integrity bypass this slice removed from the classification loader. **Inventory correction at commit time (author, searched — the ruling above was made against a one-sibling report):** the named search `grep -rn "verifyBytes" apps/dashboard/src packages` returns **three** instances of the defect class, not one — `load-stars.ts:31`, `load-annotations.ts:44`, `load-discovery.ts:17`, each declaring `verifyBytes?: boolean` and guarding with the same `opts.verifyBytes !== false` form (default verify-ON), the third of which is the BASE dataset loader. `load-skills-classification.ts` carries none (R1 fix confirmed by observation). Materially bounding the exposure: **no non-test caller passes `verifyBytes` anywhere** in the repo — today this is a public-API-surface defect, not a live integrity hole; the only opt-outs are in `load-annotations.test.ts` and `load-discovery.test.ts`. **Scope re-ruled by the owner on that corrected inventory (2026-08-14) — the original ruling was EXPANDED after the twin search discovered the complete three-loader class; it was not made against a three-loader inventory in the first place, and this record deliberately preserves that sequence rather than rewriting it.** The hotfix now closes all three surfaces in one change, because the three are structurally identical and no production caller uses the opt-out — fixing only the AI loader would knowingly leave two catalogued twins standing. The re-ruling explicitly does **not** change #245's merge gate: all three opt-outs are latent public API surface with no non-test caller passing `false`, so none of them is an M2.3 runtime correctness blocker; #245 proceeds through hosted review → convergence → merge on its own identity, and the hotfix follows the merge as its own PR (it never amends M2.3). Leaving all of them untouched in this slice was correct — it is not an M2.3 contract defect, so §4.10's OUT clause governs — and it is equally not M2.4 material: M2.4 is classification projection (scope / facets / badges), so folding artifact-integrity hardening into it destroys that slice's review identity and lets a finding on the bypass fix needlessly block classification UI. Sequence: **M2.3 merge → an independent three-loader integrity-bypass hotfix → M2.4.** Owner-locked hotfix scope, verbatim:

```text
Integrity-bypass hotfix — three-loader closure

IN
- load-stars.ts
- load-annotations.ts
- load-discovery.ts
- their directly affected tests/types

Change
- remove verifyBytes?: boolean from the public loader API
- remove every production-path integrity opt-out
- update tests so they no longer depend on a production bypass
- add regressions proving corrupted bytes cannot be accepted through any of
  the three loaders

Preserve
- each loader's EXISTING failure semantics
  - do not make Stars fail-soft merely because optional loaders are fail-soft
  - do not change annotations/discovery availability wording/state semantics
- existing provenance/freshness policy
- fetch/deploy behavior
- artifact schemas

FORBIDDEN
- replacement bypass under a different flag/name
- test-only behavior exposed through production API
- broad loader refactor
- heuristic recovery from integrity failure
- folding this work into M2.4
```

**The load-bearing distinction inside that scope (owner):** fixing all three at once is NOT a mandate to unify the three loaders' behavior. Only the shared integrity escape hatch is eliminated. `load-stars.ts` is the canonical base dataset; `load-annotations.ts` and `load-discovery.ts` are optional fail-soft layers. Each keeps its own pre-existing failure contract exactly as it stands — a hotfix that "harmonizes" Stars into fail-soft, or that rewords annotations/discovery availability states, has exceeded its scope. Equally, it is **not** a mechanical copy of this slice's fix: if investigation shows one of the three bypasses carries a different historical contract or deployment reason, it returns for adjudication rather than being changed because it "looks the same". The Preserve block is a hard boundary — remove the byte-integrity opt-out only; do not redesign any provenance/freshness gate while there.

#### M2.3 amendment record (2026-08-15) — the 2026-08-14 acceptance is superseded

**Verdict on `22c29b9`: 3/3 DO NOT PROCEED.** With the hosted multi-agent review unavailable to trigger, the owner authorised a **local Codex fallback review** as an explicitly-named substitute — recorded as what it was, never as a hosted-ultra run. Identity: `codex-cli 0.147.0`, three independent legs (`gpt-5.6-luna@max`, `gpt-5.6-luna@ultra`, `gpt-5.6-sol@max`), read-only sandbox, against the exact frozen head `22c29b9`. Every finding was reproduced by the author before any code changed.

**What the round falsified.** Two properties certified by the 2026-08-14 acceptance did not hold, and one of them is the slice's central promise:

- **F6 — "mandatory byte integrity" was not a byte check at all.** Every loader hashed `await response.text()`, i.e. DECODED text. `text()` strips a leading BOM and rewrites malformed sequences before re-encoding, so byte strings that decode alike hash alike. Reproduced against the committed artifact pair: a BOM-prefixed body whose raw digest does NOT match `classification_sha256` loaded `ready` with all 166 records, alongside a healthy control on the unmutated bytes. The R1 "integrity bypass removal" recorded above was therefore partly cosmetic — the opt-out went, but the check underneath never checked bytes.
- **F6b — the defect was class-wide, not a sibling.** The twin search (`grep -rn "verifyBytes" apps/dashboard/src packages`) found the same duplicated `sha256Hex(text: string)` shape in ALL FOUR loaders, `load-stars.ts` included — the canonical base dataset.
- **F1 — "a pre-existing dist pair survives ANY failed re-stage byte-for-byte" was false.** The commit section ran two sequential renames; a failure of the second left the new artifact beside the old meta, and the CLI published that mixed pair while reporting `skipped`. Worse than the failure case: two concurrent stagers could interleave and BOTH report `staged: true`.
- **F4 — validation and publication read different snapshots.** The source was validated from one read and then re-opened by `copyFileSync`, so a generator rewriting it in between published bytes that were never validated, with `staged: true`.
- **F5 — the staging code could never run for the commits that matter.** `.github/workflows/pages.yml` listed every sibling root artifact pair and neither classification file, so an artifact-only commit (exactly what a generator rerun produces) triggered no deploy and production kept serving the previous classification indefinitely.
- **F3 — the hook's loop immunity was overstated.** The idempotent `loading` reset blocked only the SYNCHRONOUS cycle; an unstable loader identity still drove an unbounded asynchronous one (measured: 3171 loader calls in 50 ms against a control of 1). Production was never exposed — `App` passes no loader outside tests — but it was a live trap for M2.4's first consumer.

**Owner rulings on the round (2026-08-15).** The earlier "merge M2.3, then an independent three-loader hotfix" sequencing is **superseded by this evidence**: F6 is not sibling debt, it invalidates M2.3's own runtime contract, so the hotfix is ABSORBED into this slice as a four-loader closure and #245 waits for it. Weakening the claim and merging first was explicitly rejected. `.github/workflows/pages.yml` is in scope — deploy staging that never triggers is not deploy staging. The staging core may be rewritten, but rollback alone is insufficient: pair-level serialization is required. F3 is a blocker. **F2** (temp ownership resolves by path after creation) stays a **recorded residual, not a closure**: it needs an adversary with write access to the dist directory, and the fd-relative renames that would close it are not exposed by Node — the standing boundary against a glob/sweep "fix" is unchanged.

**The normative contract above is NOT downgraded.** §4.10's validation chain already said "byte integrity (`classification_sha256` over exact bytes)". The contract was right and the implementation was wrong; this amendment moves the code to the contract, never the contract to the code.

**What the amendment lands.** A shared `readBytesVerified` primitive digests the received bytes and decodes only after the digest matches, adopted by all four loaders; the `verifyBytes` opt-out is gone from the three legacy ones, and every test that leaned on it now supplies a correct digest instead — two of those rejections would otherwise have started passing for the wrong reason. Staging becomes transactional: read-once snapshot, publication of the validated buffers with a read-back check, an exclusive lock over the commit section, and a move-aside/restore rollback — so `staged: true` means both files of one validated snapshot, never a mix. The hook anchors its lifecycle to mount and reads the loader through a ref, making identity churn a non-event; the superseded K4a contract ("a replaced loader restarts the lifecycle") is deliberately removed, since it was the very mechanism behind F3 and production never used it. The Pages trigger gains both classification artifacts plus a contract test derived from the deploy package's own filename constants, so a future artifact cannot be added without its trigger path.

**Evidence discipline for the fixes.** Every finding is pinned by a regression proven able to FAIL before its fix, not merely green after it: the integrity suite carries per-loader controls on unmutated bytes — which caught one of the author's own fixtures being invalid, a case that would otherwise have passed vacuously — plus a non-BOM byte mutation that decodes identically, so the fix cannot regress into special-casing one prefix; the hook pin was re-run against the pre-fix hook and failed at 3027 calls; the three staging pins were each proven by removing exactly the mechanism they guard (restore, lock, snapshot write) and confirming only the matching test turned red. One authored pin was discarded during this work for lacking discrimination — its injection sat after the staging write, where a re-opening implementation would also have passed — and was moved to a dedicated `beforeStageWrite` seam. Gates on the amended tree: `vitest run` **1087/1087** (106 files, +21 over `22c29b9`) · typecheck · eslint · prettier.

**Re-review of the amended head `3daa84d`: 3/3 DO NOT PROCEED — the amendment carried its own defect.** Same lineup and identity. All three legs independently converged on one **High**: moving the pre-existing pair aside is itself a two-step mutation, and those two renames sat OUTSIDE the rollback region. A failure between them stranded the old artifact under its backup name while the reason string still claimed the pair had been restored — the same defect class as F1 itself, relocated rather than removed. Fixed by making move-aside part of the protected region and keeping two ledgers: what to put back, and which destinations THIS invocation actually wrote — only the latter are ever discarded, since unconditional cleanup would delete a pre-existing file that is still in place when the FIRST move-aside is what failed. A failed restore now says so instead of claiming success. Also fixed: a lock-leak window between acquiring the lock and installing its `finally` (luna@ultra), and a lock-busy reason that now names the file as possibly stale.

**Three findings were against the EVIDENCE, not the code, and are recorded as such rather than quietly dropped.** (1) The body-read pin rejected `text()` while the amended loader calls `arrayBuffer()`, so it passed against both implementations by tripping over a missing method — a broken double, not a read failure; the double now rejects the method actually called. (2) L1/K5 no longer discriminate anything newer than the round-2 destructive implementation: every temp-file version passes them, including the one that lost the old artifact on a move-aside failure. Their comments now say so explicitly, and the rollback guarantee is carried by F1-ROLLBACK and F1-MOVEASIDE instead. (3) F4-SNAPSHOT's injection point is a seam the implementation itself invokes, so it cannot bind an arbitrary implementation and passes vacuously against the pre-amendment code, which ignores the hooks argument; that limitation is now documented in the test, with the mutation proof and the seam-independent read-back check named as the actual guarantee. **Mutation evidence for the new pins:** disabling rollback reddens both F1-ROLLBACK and F1-MOVEASIDE, while reproducing the exact re-review defect (restore only after a publish step began) reddens F1-MOVEASIDE and leaves F1-ROLLBACK green — the two cover different windows, which is precisely why the first amendment's single pin missed this.

**Sibling logged during the author's twin sweep, deliberately NOT fixed (§3 log-don't-fix).** The same decoded-text digest shape survives at two build-side sites in `packages/deploy/src/stage.ts` — the AI staging (`meta.annotations_sha256 !== sha256Hex(annText)`) and the discovery staging (`meta.dataset_sha !== sha256Hex(candidatesText)`), both hashing `readFileSync(path, 'utf8')`. It is a weaker exposure than the runtime one — Node's decode does not strip a BOM, so it needs malformed input rather than a prefix — and it is build-side, on local files, outside the owner's four-loader closure. It is named here for an owner scope call, exactly as the original `verifyBytes` sibling was, rather than widened into this slice unilaterally. Gates after the re-review fixes: `vitest run` **1088/1088** · typecheck · eslint · prettier.

**Round 3 on `805d993`: 3/3 DO NOT PROCEED again — two real defects, and the rest against the evidence.** Convergent across legs: (a) `existsSync` resolves symlink targets, so a DANGLING symlink at a destination reported "absent", stayed out of the rollback ledger, and was destroyed by the commit while the reason still claimed a restore — probed directly (`existsSync` false, `lstat` succeeds, `rename` over it succeeds) and fixed by keying the ledger on the directory ENTRY; (b) removing a destination THIS invocation published was treated as inert cleanup, so a failure there left a partial canonical artifact while reporting a clean abort — it now sets the honest-failure flag; (c) an unremovable lock file was swallowed even on success, silently disabling every later stage — it now rides out as a `warning` the CLI prints. Evidence defects fixed in the same pass: the non-BOM decode-invariant trap existed only for discovery (all four loaders now carry one, so no loader can regress to decoded-text hashing plus a BOM special case); the Pages-trigger parser could have been satisfied by a `pull_request.paths` block elsewhere in the file; and the honest-failure branch, the stale-lock diagnostic, and the dangling-symlink path were claimed but unpinned — each now has a regression, with F1-DANGLING and F1-HONEST mutation-proven (reverting the entry check to `existsSync`, and dropping the failure flag, redden exactly those two).

**Crash atomicity — adjudicated as a BOUNDED RESIDUAL, not a defect to fix here.** Two legs rated it High: a process killed between the two commit renames leaves a new artifact beside no meta, plus a lock and backups, with no `finally` able to report or undo. POSIX offers no atomic rename of two independent files, so the only real fix is publishing the pair as one unit — an artifact-layout change, not a staging change. Three facts bound it instead: the runtime loader verifies the pair's digest, so a torn pair fails soft to `unavailable` with the base browser unaffected; the next stage skips with a NAMED stale-lock reason that gives the operator the file to remove; and in the deployment path the concern cannot persist at all — every Pages run is a fresh runner whose `dist` is built from scratch, so no lock survives into a later run. Recorded in the function's own docstring alongside F2.

**Round 4 on `5d7e3ea` (first round run in an isolated checkout): DO NOT PROCEED — one real defect, three evidence gaps, all convergent across legs.** The defect is the fourth appearance of one pattern: `entryExists` treated EVERY `lstat` failure as absence, when only `ENOENT` proves it. A transient `EIO`/`ESTALE` would drop a real pre-existing file from the rollback ledger, let the commit replace it, and lose it while still reporting a restore — the identical fail-open shape this repo already fixed once in the generator's prior-artifact read, reintroduced while fixing the symlink case. Non-ENOENT errno now aborts staging before anything is touched, pinned through an injected `lstat` seam (the same precedent: a real filesystem cannot produce `EIO` on demand). The three evidence gaps were all of one kind — a behaviour claimed in the previous commit but not pinned: F1-HONEST proved only the RESTORE branch set the honest-failure flag, so the published-destination branch could revert to swallowing (now pinned on an initially-empty dist, where only that branch can report); the unremovable-lock warning was produced and printed but never asserted (now pinned at the result AND at the operator-facing lines, via a pure `formatSkillsStageReport` extracted precisely so the print is testable, plus a negative case so an always-warning formatter fails); and the Pages push-block bounding had no discriminating test, since the healthy workflow satisfies both the bounded and unbounded parser (now pinned with a synthetic workflow whose only `paths:` belongs to `pull_request`). All five round-4 pins are mutation-proven — and the mutation run is what exposed that the ENOENT fix had NO test at all: the first attempt reported green because the filter matched zero tests, which is why a mutation harness must be read for what it actually ran, not just its exit status.

**The recurring shape, stated plainly for whoever works here next.** Four consecutive rounds each found that the previous fix carried a new instance of the class it closed: an unprotected window between multi-step filesystem mutations, then a symlink-blind existence check, then a catch-all errno. The lesson is not "review more" but "after fixing a multi-step mutation, re-enumerate the interruption points of the FIX itself, and treat every `catch {}` around a filesystem probe as a fail-open until its errno set is named."

**Round 5 on `80cff34` (isolated checkout, legs able to RUN tests and mutations for the first time): DO NOT PROCEED — and it surfaced the most consequential defect since R1, one this slice CREATED.** Making the runtime loaders byte-strict left the BUILD side hashing decoded text, so build and runtime now disagreed about the canonical dataset: a leg reproduced a decode-invariant byte mutation (a literal U+FFFD's bytes replaced by a bare `0xff`) that `stageDashboardData` and `verifyBuiltArtifact` both accepted, after which `loadStars` retried and threw — **the base dashboard failing closed on a file the build had called sound.** This is materially different from the AI/discovery build-side sites logged earlier: those are fail-soft layers, this is the canonical dataset. `verifyDatasetIntegrity` now takes BYTES, its parameter type forcing every call site to migrate (TypeScript found them, including the tests), and a regression pins the decode-invariant mutation with a control on the untouched bytes.

Four more real defects, each a familiar shape: the SUCCESS path removed both derived `.staging-bak` paths unconditionally, deleting a foreign file that merely occupied one — the ownership defect the ledger exists to prevent, reintroduced on the happy path (reproduced by a leg, now pinned by F1-FOREIGN-BAK); the `hooks.lstatImpl` property READ sat between acquiring the lock and installing its `finally`, so a throwing accessor leaked the lock — the same window closed in R3, reopened by the R4 fix; `existsSync` on the SOURCES and the catch-all around `openSync` both read errno-blind, so an unreadable source directory reported "no artifacts present" and an `EACCES` on the dist reported "another stage is publishing" with advice to delete a lock that never existed — only `ENOENT` proves absence and only `EEXIST` proves contention; and `restoreFailed` conflated "could not restore the pre-existing pair" with "could not remove what this run published", sending an operator to inspect backups that never existed on an empty dist. A further leg found the canonical loader's typed-error promise was false — a rejecting transport (broken stream, unreadable meta JSON) escaped as a raw `Error` and the UI degraded to a generic message; every such path is now converted to a typed `DataLoadError`.

**Evidence findings, again the larger half.** "Mandatory integrity, no bypass" was NOT pinned: a leg reintroduced `verifyBytes` on all four loaders plus a decoded-text bypass and the entire loader suite stayed green, because every test uses default options — closed by a structural surface contract (`integrity-surface.test.ts`) asserting the escape hatch does not exist in any loader's source, with comments stripped so it tests the API rather than prose, and a control proving its own patterns can match. The lock warning was pinned only through the formatter while the CLI could still print just the first line and suppress every real warning — closed by making the formatter return ONE string, so there is no index for a caller to drop. And F4-SNAPSHOT's seam, already documented as implementation-invoked, was noted to leave the load-bearing READ-BACK check itself unpinned — closed by an `afterStageWrite` seam and F4-READBACK, which corrupts the temporary between the write and the read-back. Gate figures in this record are attributed to the head that produced them, after a leg observed that an unattributed "1088/1088" was not reproducible on a later head. Gates on the round-5 amendment: `vitest run` **1107/1107** at `e08349a`, then **1111/1111** after the AI/discovery closure below (107 files) · typecheck · eslint · prettier. Every new pin is mutation-proven, and the mutation harness now reports whether a name filter matched any test at all — the R4 lesson that a harness reporting green because it ran nothing is worse than no harness.

**Build/runtime byte-agreement closed for the remaining two pairs (owner ruling, 2026-08-15).** With the runtime loaders byte-strict and the canonical dataset already corrected, the AI and discovery BUILD-side checks were the last places still hashing decoded text — a known divergence: build accepts, deploy succeeds, runtime rejects, and the optional layer goes unavailable after a deploy that reported success. The owner ruled them IN for this PR — not because their consequence matches the canonical dataset's (it does not; those layers are fail-soft) but because leaving two catalogued twins standing would make the closure claim false. Scope granted was exactly four items — hash the exact bytes, match the runtime's byte semantics, publish the bytes that were validated, add discriminating regressions for decoded-text collisions — with fail-soft semantics, provenance/freshness policy, schemas, loader refactors and any general artifact-framework rewrite explicitly forbidden. Both functions now read their sources once as bytes, digest those bytes, and publish those same buffers instead of re-opening the sources.

**The regressions target the mutant, not the symptom.** Per the owner's instruction they do NOT test a BOM: each replaces a literal `U+FFFD`'s three UTF-8 bytes with a bare `0xFF`, which decodes straight back to `U+FFFD`. Byte string differs, decoded text is identical — so the pin kills `hash(decode(bytes))` as a class and a "string hash plus a BOM special case" repair still fails it. Each carries a control on the unmutated bytes, and both are mutation-proven (reverting either site to a decoded-text digest reddens exactly its own pin). **Recorded honestly:** the third scope item — publishing the validated buffers rather than re-reading the sources — is IMPLEMENTED but NOT independently pinned for these two pairs. Neither function has an injection seam, and adding one is outside the granted scope; the guarantee therefore rests on the code shape, not on a regression. That is a smaller claim than the skills pair's, where `beforeStageWrite`/`afterStageWrite` make both the snapshot and the read-back check testable.

**Round 6 on `2a955cf` (owner-designed charter: audit REMEDIATION-CREATED WINDOWS, prove build⇔runtime acceptance agreement, and be as hard on the evidence as on the code): DO NOT PROCEED — and it was the sharpest round of the six.** All three legs ran real mutations in private copies. Two code findings landed that no earlier round had reached. First, `stageDashboardData` validated one byte snapshot and then `copyFileSync` RE-READ the sources for two unprotected copies — the canonical dataset had the snapshot-fidelity defect the skills pair had already closed, so the bytes published were never the bytes verified. It now publishes the validated buffers. Second, and only visible because Charter B forced the question: build and runtime still disagreed about a BOM, in the opposite direction from the original defect. The web `TextDecoder` SWALLOWS a leading BOM while Node's `Buffer.toString('utf8')` keeps it and `JSON.parse` rejects it — so a BOM-prefixed artifact whose digest legitimately covers the BOM was ACCEPTED at runtime and REFUSED by the build, reproduced across all four pairs against the real 744-repo dataset. Fixing the digest on both sides had not made the two ends agree; the DECODE step had to agree too. The runtime now decodes with `ignoreBOM: true`, so both ends refuse a BOM rather than disagreeing about it. Also fixed: a synchronous throw from `fetchImpl` escaped the typed-error boundary because `doFetch(...)` is evaluated before `.catch` attaches; and the skills abort report picked ONE of `restoreFailed`/`publishedResidue` when both can be true, silently dropping a real failure that sends an operator somewhere different.

**Seven evidence findings — again the larger half, and this time they cut deeper than the code ones.** The canonical byte regression tested `verifyDatasetIntegrity` DIRECTLY and never its staging call site: a leg reproduced the whole defect by making `stageDashboardData` decode and re-encode before calling the verifier, with every dataset test still green — a guarantee is only as strong as the level it is pinned at, so the pin moved to the call site. The "no integrity opt-out" surface pin was a blacklist of three names and fell twice, to `verifyIntegrity` and to `allowUnverified`; it is now an ALLOWLIST — these are the only options a loader may declare, so a new one is a deliberate edit to that list. The skills pair, alone among the four, had no BUILD-side decode-collision trap. `F4-READBACK` corrupted only the artifact temporary, leaving half the pair guarantee unpinned. And three remediation claims from round 5 — source `lstat` ENOENT-only, lock-open EEXIST-only, and the `lstatImpl` getter read inside lock protection — had no discriminating pin at all; each now has one, reached through injectable `lstat`/`open` seams because a real filesystem cannot produce `EIO`/`EACCES` on demand. The Pages trigger contract checked positive membership but would have scored a filter carrying `!skills-classification.json` as covering the artifact; negative patterns are now rejected outright. Every round-6 pin is mutation-proven — including one whose first mutation came back GREEN because the mutation itself was unfaithful (`Promise.resolve().then(call)` still catches a synchronous throw); re-run against the real defect form it reddens. That is the same lesson as round 4's zero-match filter, in a new disguise: **a mutation harness proves nothing until you have checked that the mutant is the defect you mean.**

**Two items left OPEN for the owner rather than decided by the author.** All three legs raised that AI/discovery publication performs two sequential writes with no rollback or serialization — real, but a PRE-EXISTING property (it was two `copyFileSync` calls before) that the owner's four-item scope for those pairs explicitly did not include, and closing it means extending transactional publication to two more pairs, which the same ruling forbade. Logged, not fixed. Separately, one leg showed the stars RUNTIME omits two invariants the BUILD enforces — `repo_count === repos.length` and unique `node_id` — so a correctly-hashed pair with `repo_count: 999` or a duplicated repo is refused by the build and accepted by the runtime. That is a Charter B violation for the canonical dataset and the fix is small, but it changes `loadStars` behaviour beyond byte integrity, so it awaits an owner ruling. **One guarantee is honestly unpinnable within the granted constraints:** end-to-end delivery of the stuck-lock warning through the CLI. Returning a single string does not close it — a caller can still `.split('\n')[0]` — and the only way to force a lock-removal failure in a subprocess is a test-only seam in production code, which a standing ruling forbids. Recorded as a known-unpinned link rather than claimed closed. Gates: `vitest run` **1123/1123** · typecheck · eslint · prettier.

**R6-S1 — canonical acceptance divergence, closed (owner ruling, MUST FIX).** Byte agreement is not acceptance agreement. A dataset with a CORRECT digest and structurally valid JSON, but a `repo_count` disagreeing with the repo list or a repeated `node_id`, was REFUSED by the build and ACCEPTED by the runtime — so the canonical browser could render a dataset the build would never have published. The invariants now live in `@starred/schema` as a pure, Node-free function that both sides call, per the owner's constraint that sharing must not drag deploy code into the browser bundle; the schema package was already a runtime dependency of both. Regressions are pinned at the `loadStars` BOUNDARY, not at the helper, and were proven RED before the fix. The mutation evidence is stronger than usual here: neutering the shared primitive reddens the runtime pin AND the build's own dataset tests, which is what proves the two ends genuinely share one implementation rather than two copies that happen to agree today.

**Owner dispositions recorded, not silently absorbed.** AI/discovery pair publication still performs two sequential writes with no rollback or serialization — all three legs raised it, and it stays OUT of this PR by ruling: it is a PRE-EXISTING publication property, not a contradiction this remediation created, its consequence is already contained (a torn optional pair fails the runtime pair check, the layer goes unavailable, the canonical browser stays usable), and closing it would extend transaction machinery to two more pairs — an artifact-publication design question that deserves one deliberate answer for all three pairs rather than a third hand-rolled rename/backup choreography. Recorded as **known optional-layer publication-hardening debt, non-blocking for #245.** Separately, end-to-end delivery of the stuck-lock warning through the CLI is accepted as a **non-blocking evidence residual** on the owner's stated conditions, each verified: staging never reports a failure as success; a stuck lock does block later publication; the code path does hand the diagnostic to the CLI; and — stated plainly rather than dressed up — **there is no discriminating end-to-end pin for warning delivery.** Returning a single string does not close it (a caller can still split it), and forcing a lock-removal failure inside a subprocess would need a test-only seam in production code, which a standing ruling forbids. It is NOT "E2E verified".

**The verification harness itself failed three times today, always in the direction of reporting success — recorded because that is the most dangerous shape a tooling defect can take.** First a name filter matched zero tests and the run exited 0, so a completely unpinned fix was reported as proven (round 4). Then the validity check parsed only stdout while vitest summarises on stderr, so every run self-reported "0 tests ran". Then, ANSI-stripped and reading both streams, it still mis-parsed the summary whenever EVERY selected test failed, because that form omits the "passed" clause the regex required. Each fix exposed the next. The harness now requires, per mutation: a GREEN baseline that actually ran N tests, and a RED mutant that ran the same N. Re-running the round-6 batch under the working harness re-confirmed seven pins — and falsified one: the canonical publish "snapshot fidelity" mutation had passed only because the earlier mutant failed to compile, and the real mutant did not redden anything, because no test rewrote the source mid-stage. That gap is now closed by a `beforePublish` seam and a pin proven under the fixed harness. **A mutation result is evidence only when the mutant is the defect you mean AND the harness is shown to observe what it claims.** Gates: `vitest run` **1127/1127** (108 files) · typecheck · eslint · prettier · `pnpm schemas`.

**Round 7 on `d3af8d3` (Charter D added: does the runtime enforce every canonical invariant the build does?): DO NOT PROCEED.** Two legs converged on a HIGH that exposes how partial the previous BOM fix was: the artifact half of every pair had been made BOM-consistent, but the META half still went through `Response.json()`, which strips a BOM, while the build kept `Buffer.toString('utf8')` and rejected it — so a BOM-prefixed meta was accepted by all four loaders and refused by all four stagers, and the live smoke in `verify.ts` stripped it too. **Fixing one file of a two-file pair is not fixing the pair.** All four loaders and the smoke now decode meta through one shared BOM-preserving reader. Also fixed: `metaRes.json()` was called before `.catch` attached, recreating for meta exactly the evaluation-order bug already fixed for `fetchImpl` — a synchronous throw escaped untyped.

**The deepest finding was against the evidence method itself, and it changed the design.** A leg defeated the snapshot-fidelity pins with a mutant that re-opened the sources AFTER validation but BEFORE the test seam — and, since a read-back compares against the validated buffer, re-assigning that buffer defeated the read-back too. The conclusion is general: **any injection point the implementation itself invokes can be defeated by acting just before it.** So the property stopped being asserted and became ENFORCED: every one of the four pairs now re-hashes what actually LANDED and compares it against the digest recorded in META — a value no source rewrite and no buffer re-assignment can influence. The canonical meta half, which carries no self-digest, gets a read-back instead, and is labelled as the weaker check it is. Each guard is then pinned by driving it to FIRE, because a detector nobody has watched fire is not evidence.

**Five further evidence defects, each closed:** the destination-`EIO` pin threw for every path and so aborted at the SOURCE probe, pinning the wrong step entirely (now scoped to the dist path); the options allowlist inspected only the first interface declaration, so a MERGED second declaration or an `extends` could hide a bypass (now rejected outright, with a control); the AI/discovery and canonical-meta snapshot properties had no pin; and — the one with real production consequence — **every hook and App test injected a loader, so the branch production actually takes (no loader, fall through to the real loader) had never once executed.** A broken default would have left classification permanently unloaded in production with the entire suite green. Now pinned by driving the hook with no loader against a stubbed transport.

**One boundary stated honestly rather than closed:** with the structural guard in place, a hypothetical re-opening publisher can no longer publish unverified bytes — it fails loudly instead — so which buffer the publisher uses is no longer safety-critical, and the AI/discovery "publishes the validated buffer" detail remains unpinned by design rather than by omission. Gates: `vitest run` **1133/1133** (108 files) · typecheck · eslint · prettier.

**Round 7's third leg added four more, all closed.** The sharpest was that `AGREE-BOM` — the pin for the BOM decode fix — **also passed against the OLD text-hashing implementation**, which rejects the same fixture as an integrity mismatch: the right answer for the wrong reason. It now asserts the failure KIND, so only a byte-digest plus a BOM-preserving decode reaches the parse stage, and it reddens against both broken forms. The build side of the shared `node_id` invariant had no boundary pin, so a call-site mutation keeping only the count problem passed the whole deploy suite. `verifyBuiltArtifact` is a THIRD call site of the canonical byte contract and its tests used ordinary UTF-8 only, so swapping it to decoded-text hashing would have passed — it now carries the same decode-invariant trap as the staging and helper call sites. **And the mutation evidence this record keeps citing is now an auditable artifact rather than a claim:** `scripts/mutation-check.py` runs a named mutation, re-runs a chosen test, and refuses to report a verdict unless the baseline was green AND both runs actually executed tests — encoding, in comments, each of the three ways this harness previously failed by reporting success. Gates: `vitest run` **1136/1136** (108 files) · typecheck · eslint · prettier.

**Process defect found and corrected by the author (recorded because it invalidates provenance, not just tidiness):** rounds 2 and 3 ran against the shared worktree while that worktree was being edited, so verdicts nominally frozen to a SHA were partly reading later uncommitted state. One leg detected this and excluded the drift explicitly; that it was caught by a reviewer rather than by the process is the finding. Subsequent rounds run against an isolated checkout of the reviewed SHA.

---

## 5. Join & drift rules (verified 2026-08-10)

Observed against a **697-repo `stars.json`** — per git history that count corresponds to the **2026-07-30 dataset snapshot (`55ae7b2`)**, the state the 169/171 analysis ran against; by the spec's own landing commit (`2987e92`, 2026-08-10) the daily-synced dataset was already 734, and 742 at M1.2's close. These coverage figures are historical to the `55ae7b2` snapshot; M2 recomputes them at generation time: **169/171 exact-name matches**; the 2 unresolved are `jacob-bd/notebooklm-mcp-cli` and `AgentWrapper/agent-orchestrator` (both absent — `grep` count 0). Stars at that snapshot contain similarly-named `jacob-bd/gemini-notebook-mcp-cli` and `Untrivial-ai/agent-orchestrator` — **plausible renames, NOT proof of identity.** So `697 − 169 = 528` unclassified at that snapshot.

- The join is **build-time** (`name_with_owner → node_id`); runtime joins `node_id → live repo` only, and **never** trusts the `.md`'s name/stars/url/language.
- **No fuzzy remapping, ever.** The only admissible resolution sources: (1) case-insensitive exact `name_with_owner` match against the generation-snapshot stars; (2) a **human-reviewed durable alias map** (`old_owner/old_repo → node_id`, shape in §4.7), added only after manual confirmation; (3) a prior generated record's stored `node_id`. Otherwise the entry stays `unresolved` and is retained + surfaced.
- **Executable resolution rule (M2.1 — evaluate-all, not first-hit).** For EVERY entry the generator evaluates all three sources (each lookup case-insensitive on `source_name_with_owner`; a prior record with `node_id: null` contributes no candidate) and collects the distinct non-null candidate `node_id`s: **zero** → `unresolved` (retained, `resolution: "missing_from_stars"`); **exactly one** → resolved to it; **more than one** → **build FAILURE with the entry and every candidate id named**. A first-hit/short-circuit walk is explicitly wrong — it cannot even see the exact-vs-alias conflict (a recycled name: alias says A, a live exact match now says B) or the exact-vs-prior conflict (same-name different-repo swap) that this rule exists to surface. Silently preferring any source would paper over exactly that drift; the fix is human (update the `.md` or the alias map).
- **Auxiliary-input edge semantics (M2.1):** a **stale alias row** (its `source_name_with_owner` matches no current `.md` entry) is NOT a build failure — it resolves nothing, so it can corrupt nothing; the generator surfaces it in diagnostics so the map gets pruned (requiring atomic `.md`+map edits for every entry removal would be friction without integrity gain). A **present-but-invalid prior artifact** is a build failure with a named escape (§4.6). Alias/prior lineage is fingerprinted in meta (§4.4).
- **`node_id` is stable across renames** — so once the 2 missing ids are recovered into the source (one-time, human-confirmed), a later owner rename resolves automatically to the repo's new name.
- **Three distinct coverage numbers** (never conflate): `169 matched · 528 unclassified · 2 unresolved source entries`. The downloadable metadata / coverage diagnostics MUST retain the unresolved names + reasons — satisfied by the artifact itself (§4.2: the retained `source_name_with_owner` + `resolution` as the machine reason) plus the alias map's human `reason` for recovered ids; no separate per-entry note field exists.

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

| ID           | Test                                                                                                                                                                                      | Status |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| M0-FS-1      | `dashboardToView(state, false)` neutralizes `categories`/`aiTags`, preserves other filters                                                                                                | ✅     |
| M0-FS-2      | AI category filter + AI unavailable → base repos preserved (2 of 2), not 0                                                                                                                | ✅     |
| M0-FS-3      | AI category filter + AI ready-but-unannotated → correctly narrows to 0 (behavior intact)                                                                                                  | ✅     |
| M0-FS-4      | View: bookmarked `?category=…` + no annotations → all repos, no "· filtered", degraded notice shown, URL retained                                                                         | ✅     |
| M0-FS-5      | AI unavailable + a canonical filter → AI suppressed, canonical still applies, degraded shown                                                                                              | ✅     |
| M0-FS-6      | AI `loading` → filter held inactive with loading-specific wording (not "unavailable")                                                                                                     | ✅     |
| M0-SORT-1    | `defaultDirection`: name→asc, dates/counts→desc                                                                                                                                           | ✅     |
| M0-SORT-2    | Selecting "Name" in the sort control yields A→Z and `?sort=name_with_owner` (asc = Name's field default, omitted since M1.1's canonical serializer; the row's test was updated with M1.1) | ✅     |
| (regression) | full dashboard suite green (121/121)                                                                                                                                                      | ✅     |

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

**M1.2d (2026-08-13)** — gates: `pnpm -r typecheck` · `eslint .` · `prettier --check` (slice files) · `vitest run` **800/800** (+4 FSCROLL). Cross-model review (adaptive): R1 full lineup — Luna@max + Luna@ultra PROCEED; Sol@max **FIX**, a real defect class: bounding keyed on `showAll` missed collapsed lists inflated past the budget by selected-overflow rows (Sol's cited "Show fewer" trigger does not exist, but three real paths do — URL preselection, drawer-instance selections, section collapse/reopen resetting `showAll`); fixed by keying the bound on rendered length, pinned by FSCROLL-4. R2 on the amended diff: Luna@max **PROCEED** (3/3) — then both external providers died mid-round (Codex usage limit, reset 2026-08-18 11:46; Grok 402 balance exhausted): Luna@ultra + Sol R2 legs are **recorded missing lenses**, not claimed. §6 fallback: fresh-context same-model critic (packet-vs-tree byte-identity, source verification of all three paths, fourth-path hunt empty, vitest re-run 38/38) **PROCEED** with one comment-only nit, fixed post-verdict and disclosed. Browser smoke: 2236-topic expansion contained in a 352px box; page height 8449px unchanged; collapsed default 332px no-scroll; focused deep option auto-scrolls into view; drawer facet bounded (352 vs 809). **Backfill pending** (owner ruling): Sol + Luna@ultra re-run on this slice **once external review capacity returns** — at ruling time the provider's stated quota reset was 2026-08-18 11:46, the then-earliest expected date — as **assurance backfill**; the recorded gap stays in history (never retroactively rewritten to "3/3 complete"); AGREE closes the residual, a new verified correctness finding reopens M1.2d as a normal amendment, a nit changes nothing. _(Timeline precision, PR #239 review round 2: the owner restored account capacity the SAME day — ahead of the provider's stated reset — and the restoration was verified by dry-run pings before any leg ran; the backfill precondition was restored capacity, not the calendar date, so the same-day completion below is consistent, not premature.)_ _(Provenance precision, added in the PR #239 review: the `showAll`-keyed intermediate that R1 reviewed existed only in the working tree between R1 and its same-session fix and was never separately committed — `f48ac8e^` predates any bound and `f48ac8e` carries the final length-keyed bound; the R1 packet/verdict artifacts are session-side, not in-repo, so this record is the surviving account of that intermediate.)_ **Backfill completed (2026-08-13 — capacity restored same-day, verified by dry-run pings at the exact invocation shapes):** Sol@max + Luna@ultra ran as retrospective assurance on the committed snapshot `f48ac8e` — **2/2 PROCEED, 5/5 checks PASS each, zero findings, zero nits**; Sol confirmed its own R1 finding resolved by the length-keyed bound + FSCROLL-4; both confirmed this §13 record preserves the gap accurately. **Residual closed**; the historical record of the incomplete R2 lineup stands unchanged. Reviewed diff = this commit minus this note and minus the disclosed comment correction. This acceptance is a **one-off recorded-gap exception** — the §6 fallback critic is NOT generalized into the standing pre-commit gate.

**M1.2e / M1.2f (2026-08-13)** — `PAUSED_FOR_REVIEW_CAPACITY` (owner ruling): production implementation deferred until the standard external lineup (Luna@max · Luna@ultra · Sol@max) is available again; planning / read-only orientation / fixture & acceptance-criteria design may proceed if the production tree stays untouched. Rationale: M1.2f is the integration regression pass — cross-slice interaction deserves the full lineup, and stacking unreviewed implementations in one tree destroys per-slice review identity. M1.2d backfill runs first when capacity returns, then M1.2e resumes under the normal gate.

**M1.2e (2026-08-13, post-backfill — normal gate restored)** — gates: `pnpm -r typecheck` · `eslint .` · `prettier --check` (slice files) · `vitest run` **804/804** (+TCOL-1..4). Cross-model review (standard lineup, one round): **Luna@max · Luna@ultra · Sol@max — 3/3 PROCEED, zero findings**, all seven charter checks PASS from all three lenses. Implementation: the `+N` affordance becomes a real toggle (expanded label `Show fewer`, `aria-expanded` both ways, collapsed accessible name `+N` preserved); new presentation-only `selectedTopics` prop (View passes canonical `state.topics`): selected topics order first in BOTH states and the collapsed budget is `max(TOPIC_LIMIT, selected)` — a selected topic can never be hidden by the collapsed state; toggle stays LOCAL `useState`, §6 untouched (TCOL-4 pins the URL through a full cycle). Browser smoke: 10-topic card 4→10→4 cycle with URL unchanged; `?topic=travel` (9th topic in repo order) renders `[travel, …]` first while collapsed with `+6` correct. Reviewed diff = this commit minus this note (doc-only, added post-verdict).

**M1.2f (2026-08-13) — integrated closure, verification-only.** Production delta **ZERO**; the diff adds only integration regression tests (INT-1..6) + this record. Gates: `pnpm -r typecheck` · `eslint .` · `prettier --check` · `vitest run` **810/810**. Integrated browser smoke (one live Chromium session, desktop 1280 + narrow 390): stuck toolbar survives facet expansion, density switch and pagination; 2236-topic facet bounded at 352px in sidebar AND drawer under the combined state; tabs stacking correct under non-default density; card topic toggle inert to a fully populated URL; no horizontal overflow (one drawer probe misfired against a stale node/wrong facet, re-probed correctly — probe artifact, disclosed). Cross-model review (standard lineup, adaptive): R1 Luna@max **FIX** + Sol@max **FIX** (six confirmed TEST-STRENGTH findings — stale-DOM-reference false-passes, a tautological ordering, unproven ready result set, an unexercised expansion, and TopicFacet's untested selected-overflow path; NO production defect, all three legs confirmed zero production delta remains correct), Luna@ultra PROCEED with the same INT-4 nit; all six fixed (re-query semantics, live-page ordering, result-set proof, real 17-topic expansion, INT-6 added). R2 on the amended tests-only diff: **3/3 PROCEED, 4/4 focused checks** — all three lenses conclude the seven-point closure matrix is established and **the milestone can close**. Reviewed diff = this commit minus this note and the status-line update (doc-only, added post-verdict).

**M1.2 milestone closure (2026-08-13):** a–f all owner-accepted under the per-slice gate (`ce91617` · `e3f30db` · `6469a62` · `f48ac8e`+`3d0f95d` · `2992f68` · this commit). The §13 charter is fully discharged: R3 effective-filter-count, density compact/comfortable, sticky toolbar (+tabs stacking), bounded facet scrolling, topic expand/collapse with selected-first pinning, and the integrated regression pass — 810 tests green, canonical §6 state untouched by any presentation feature.

### PR #239 review rounds (post-closure, pre-merge)

**Round 1 (2026-08-13, Codex xhigh on the seven-commit PR):** three findings, all confirmed by reproduction and accepted. **R1-1 (correctness, M1.2c amendment):** the stuck toolbar (bottom ≈55px, opaque, z 10) permanently covered the sticky sidebar's top 39px (`top: 1rem`) — the Language section header hit-tested to TOOLBAR; missed because jsdom tests pin structure/classes, not geometry, and the slice smoke never probed the sidebar's own sticky offset. Fixed: RepositoryView publishes the layout-dependent toolbar height as `--toolbar-h` (ResizeObserver; jsdom-guarded), the sidebar's `top`/`max-height` consume it (tabs variant mirrored); STICK-4 pins the wiring; browser re-smoke measures the clearance. **R1-2 (correctness, M1.2b amendment):** `.density-compact .card-list` silently defeated the pre-existing ≤900px single-column media rule (equal-or-higher specificity, later in source) — at 800px compact rendered 2 columns while comfortable honored 1; the CSS comment's "never fights the responsive rules" claim was false. Fixed: the column override now lives inside `@media (min-width: 901px)` (spacing stays densified at all widths), comment corrected, browser re-smoke at 800px. **R1-3 (provenance):** the M1.2d record described a `showAll`-keyed intermediate that no committed snapshot carries (working-tree-only between R1 and its fix) — a precision note now states this explicitly in the record. Gates after amendments: `vitest run` **811/811**, typecheck/eslint/prettier ✓; amendment diff reviewed by the standard three-lens lineup before commit (see the round-2 entry below once the Codex loop re-runs).

**Round 2 (2026-08-13, Codex xhigh on the amended PR):** confirmed all three round-1 fixes resolved; **one new finding (Medium, provenance):** the M1.2d record read as chronologically contradictory — "backfill pending until the 2026-08-18 quota reset" followed by "completed 2026-08-13" left an auditor unable to tell early-capacity from a jumped gate. Accepted as a wording-precision defect (the substance was correct: the owner restored capacity same-day, ping-verified, before any leg ran): the pending clause now states the precondition as **restored capacity** (the 2026-08-18 date recorded as the then-stated provider reset, not a hard gate) with an explicit timeline-precision note. No production/test change; doc-only correction per the evidence-only rule.

**Round 3 (2026-08-13, Codex xhigh):** rounds 1-2 fixes stand; **one new finding (non-blocking, doc staleness):** §5's coverage observation ("checked-in 697-repo `stars.json`", `697 − 169 = 528`) was written against the spec-authoring snapshot while the live dataset had grown to 742 via the daily sync — the figures read as current and were not reproducible from the PR snapshot. Fixed: the observation is now explicitly marked as the 2026-08-10 authoring snapshot (742 noted at M1.2 close; M2 recomputes coverage at generation time); all four `697` occurrences swept and adjudicated — one factual claim marked historical, two illustrative examples and one sample-JSON value left as illustrations. Operational note, recorded for audit honesty: this round's dispatch produced two orphan duplicate queue tasks (a late-submitting hung round-2 dispatch and a duplicate round-3), both cancelled via the companion CLI before they could return divergent verdicts; the adjudicated round-2/round-3 results are task-msr67j82 and task-msr71b3z.

**Round 4 (2026-08-13, Codex xhigh):** three findings, all doc-precision, all reproduced and fixed. **R4-1 (Medium — a defect in the round-3 fix itself, honestly attributed):** the round-3 correction labeled the 697 figure "snapshot at spec authoring, 2026-08-10", but git history shows 697 corresponds to the **2026-07-30 dataset (`55ae7b2`)** while the spec's landing commit (`2987e92`, 2026-08-10) already carried **734** (742 at HEAD) — the date was asserted from memory, not verified; §5 now cites the commit-anchored snapshot chain (697@`55ae7b2` → 734@`2987e92` → 742 at close). **R4-2 (Low):** §3's M1.2 entry still read "(active …)" against the closed status elsewhere — now "(complete — per-slice acceptance records in §13)"; same-class sweep also fixed the stale "(this change)" labels on M0/M1.1 (pre-existing, now "(merged #234)"/"(merged #237)"). **R4-3 (Low):** the M0-SORT-2 acceptance row still showed `?sort=name_with_owner&direction=asc`, stale since M1.1's default-direction omission (M1.1's own §-note says the TEST was updated; the table row was missed) — row now matches the shipped serializer; the §6.1 backward-compat note about redundant legacy URLs is intentional and unchanged. Doc-only round; no production/test change.

### Out of scope (→ later / M2)

- URL codec architecture; requested/effective page semantics; the 48/page constant.
- Any second view-state owner.
- M2 discovery/classification generation + provenance.
- Broad visual redesign; unrelated responsive cleanup.
