# ADR-002: Model-free meta-rebase preserves PROV-5 coverage (ROAD-A)

- Status: Accepted (safety slice; NOT wired into any workflow)
- Date: 2026-07-08
- Milestone: P3.6 (roadmap "Next")

## Context

Each AI annotation's source fingerprint DELIBERATELY excludes the whole-dataset
SHA (`packages/classifier/src/fingerprint.ts`, FP-5/PUB-3): an unrelated star
delta must not churn an unchanged repository's annotation. The dataset SHA is
represented ONE level up, in `ai-annotations-meta.json.dataset_sha256`, where the
provenance gate's **PROV-5** check requires it to equal the current base dataset
(`packages/classifier/src/provenance.ts`).

The daily sync rewrites `stars.json` at 05:23 UTC, changing `datasetSha256`. Any
un-merged AI PR whose meta records yesterday's SHA is therefore rejected by
PROV-5 the next morning — **even though every annotation in it is individually
still valid** (their fingerprints do not depend on the dataset SHA). This creates
a same-day review-latency SLA: rebuild + re-push the PR, or it dies.

ROAD-A proposes to remove that SLA by letting an executor **re-stamp** an
in-flight PR's `dataset_sha256` onto the current base WITHOUT calling the model.

## The threat PROV-5 covers

PROV-5 enforces an invariant: _the base the annotations were verified against
equals the base the meta points to._ Without it, a PR could present annotations
verified against base X while the meta claims base Y — decoupling the verification
context from the published pointer, so a consumer trusting `dataset_sha256` could
be misled about which dataset the annotations correspond to. PROV-5 is the only
check that binds the meta's dataset pointer to the verified base.

## Decision

Ship a **pure, model-free `rebaseAiAnnotationsMeta`** helper that re-stamps the
meta ONLY after re-running the FULL provenance gate against the current base:

1. Require the head `ai-annotations.json` bytes to be canonical (byte-identical
   to `serializeAnnotations` of their parse); reject otherwise.
2. Run `verifyAnnotationProvenance` against the current base with
   `headMetaDatasetSha256 := datasetSha256` — i.e. as if the meta were already
   re-stamped. This runs every per-annotation check (README OID/path, canonical
   metadata, source fingerprint, executor/profile/prompt, per-run budget, prune)
   **plus PROV-5** unchanged.
3. Emit the re-stamped meta ONLY if that verification passes; the annotation
   bytes are preserved exactly and the meta's `generated_at` is preserved (no
   timestamp churn) — only `dataset_sha256` (and the derived `annotations_sha256`
   over the unchanged bytes) reflect the current base.

### Why this preserves PROV-5's coverage rather than relaxing it

The re-stamp writes `dataset_sha256 = current base` ONLY after the annotations
have been re-verified against that current base. So the PROV-5 invariant — the
verified base equals the pointed-to base — still holds by construction. A
re-stamped artifact is exactly as trustworthy as a fresh classification run
against the current base. **PROV-5 in `verify-ai-provenance` is not changed, and
remains the final authority at merge time.**

## What this does NOT do (scope guard)

- It does **not** change PROV-5, the provenance gate, `verify-ai-provenance`, the
  structural gate, `max_total_per_run`, the AI budget, or any required-check /
  ruleset-bypass semantics.
- It is **not** wired into any workflow, required check, bypass actor, or
  auto-merge path. It is a manual/executor helper only.
- It does **not** call a model and needs no new secret; in production it uses the
  same read-only README discovery seam (`ReadmeSource`) the planner already uses.

## Residual risks

- Live README OIDs can drift between a re-stamp and merge. This is caught by the
  live `verify-ai-provenance` re-verification at merge time — the re-stamp is a
  convenience, never the authority.
- Automating the re-stamp inside CI, or relaxing PROV-5, is a SEPARATE decision
  requiring its own ADR and a stronger proof.
- The offline unit tests inject a fake `ReadmeSource`; they prove the logic, not
  that live refs will not drift. The live gate covers that.
