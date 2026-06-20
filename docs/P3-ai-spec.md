# P3 - AI Classification and Enrichment

P3 adds optional AI-generated repository category, controlled tags, and a concise
summary without changing the canonical `stars.json`.

```text
stars.json            = canonical GitHub data, fail-closed
ai-annotations.json   = optional enrichment, fail-soft
```

The dashboard must remain usable when no executor is configured, classification
is partial, an executor fails, an AI artifact is missing or invalid, or an
individual repository cannot be classified.

## Trust boundary

Claude Routines and Codex App Automations are interchangeable **agent
executors**, not StarLedger's trusted core. They can create untrusted candidate
classifications only. The repository owns planning, validation, serialization,
hashing, and eventual publication gates. P3.0 only supplies a trusted structural
artifact gate; it does not prove classification provenance.

```text
deterministic planner
  -> bounded ClassificationManifest
agent executor
  -> ClassificationCandidate
deterministic validator and assembler
  -> validated public artifacts
Git PR and CI
  -> publication
```

P3 v1 is PR-gated. An executor creates a dedicated branch and pull request; it
never pushes `main`, updates a state branch directly, or merges itself. Claude
Routine is the initial cloud executor. Codex App Automation is a local,
worktree-based fallback. Enable only one scheduled executor at a time.

`.github/workflows/ai-agent-pr.yml` inspects **every** pull request — the
structural gate is **path-triggered**, not branch-triggered. It uses
`pull_request_target`, checks out the protected base revision, and fetches the
candidate commit as data only; the trusted CLI (`verify-agent-pr`), not
agent-controlled PR code, decides from the changed paths. A PR that touches no AI
artifact passes with no executor checks. A PR that touches `ai-annotations.json`
or `ai-annotations-meta.json` must originate from an approved **same-repository**
executor branch (`claude/*` or `codex/*`) and change only the complete, valid
artifact pair — so renaming a branch, or a fork impersonating `claude/*`, can
never bypass validation. Branch prefixes identify the approved executor only
AFTER an artifact change is detected; they never determine whether validation
runs. Event-controlled values (branch/repo names) are passed via environment
variables, never interpolated into the shell. The job has read-only contents
permission and no repository secret, and blocks artifact deletion and rename. It
is not a provenance/current-fingerprint gate until P3.1 adds trusted source
discovery and planner recomputation.

## P3.0 status and boundaries

P3.0 establishes contracts and deterministic scaffolding only. It does **not**
call a model provider, fetch a README, schedule a job, publish directly to main,
modify the dashboard, or change `stars.json`.

P3.0 explicitly does not use `AI_API_KEY`, a provider adapter, a model timeout,
or GitHub Actions model calls. Executor subscription authentication belongs to
the executor platform and is never a StarLedger configuration value.

## Packages and temporary inputs

```text
packages/ai-schema/src/
  scalars.ts            UTC timestamps, canonical summaries, model labels, Git OIDs
  taxonomy.ts           fixed category/tag vocabulary and limits
  annotation.ts         strict public annotation contract
  artifact.ts/meta.ts   deterministic public files and exact-byte hash
  execution-profile.ts  controlled executor methodology version
  job.ts                immutable ClassificationJob and job_id
  manifest.ts           deterministic temporary work list
  candidate.ts          strict untrusted agent output contract

packages/classifier/src/
  config.ts             executor-neutral versioned configuration
  validate-candidate.ts exact job/candidate matching and normalization
  assemble.ts           deterministic public artifact assembly
  verify-diff.ts        agent PR path allowlist
  cli.ts                plan, validate, apply, artifact and diff commands

prompts/classify-agent-v1.md
  shared instruction transport for Claude Routine and Codex Automation
```

Manifests and candidate bundles may contain bounded, preprocessed README text.
They live under ignored `.ai-runs/`, must remain temporary, and must never be
committed. Public artifacts never contain raw README text, prompts, model output,
error bodies, or secrets.

## Taxonomy and execution profile

`taxonomy_version` is `"1"`. It covers the fourteen closed primary categories,
the sorted controlled tag vocabulary, and the limits: one category, zero to six
tags, tag length at most 32, and summary length from 80 to 400 characters.
Unknown categories and tags are rejected. The taxonomy test verifies every
controlled tag remains within `TAG_MAX_LENGTH`.

`execution_profile_version` is `agent-v1`. It is owned by StarLedger and is the
authoritative methodology/cache invalidation key. `executor_kind` is bound to
each manifest and job; switching between `claude-routine` and `codex-automation`
therefore produces new job IDs and prevents one executor's candidates from
satisfying the other executor's manifest. Bump the profile if the instructions,
selected model, reasoning level, or methodology changes enough to warrant
reclassification. An executor-reported `model_label` is optional observation
data, canonicalized, and never a trust or cache key.

The supported `execution.kind` values are `claude-routine` and
`codex-automation`. They share the same candidate schema, but each manifest is
bound to exactly one of them.

## Public artifact contracts

`ai-annotations.json` is strict, sorted by `node_id`, and joins the dashboard
only through that key. It carries exactly one category, normalized tags, summary,
source fingerprint, and generation provenance:

```json
{
  "schema_version": "1.0",
  "taxonomy_version": "1",
  "annotations": [
    {
      "node_id": "R_kgDO...",
      "category": "developer-tools",
      "tags": ["automation", "cli"],
      "summary": "A concise factual explanation within the documented character bounds.",
      "source": {
        "kind": "readme",
        "readme_path": "README.md",
        "readme_oid": "abc123",
        "repo_metadata_sha256": "...",
        "fingerprint": "..."
      },
      "generation": {
        "executor_kind": "claude-routine",
        "execution_profile_version": "agent-v1",
        "model_label": "informational-only",
        "prompt_version": "classify-v1",
        "generated_at": "2026-06-20T00:00:00Z"
      }
    }
  ]
}
```

`ai-annotations-meta.json` stores the SHA-256 of the exact annotation bytes,
the annotation count, taxonomy version, canonical dataset hash, and generation
timestamp. It is updated only when annotation bytes change.

All committed timestamps are UTC ISO-8601 strings ending in `Z`. Summaries are
normalized before validation: Unicode NFC, CRLF/CR to LF, horizontal whitespace
collapsed, newlines collapsed to spaces, and leading/trailing whitespace
trimmed. The committed artifact only accepts canonical single-paragraph
summaries and rejects control characters. `readme_oid` is an opaque Git object
ID from GitHub, not a StarLedger SHA-256 fingerprint.

## Job and candidate contract

Each `ClassificationJob` includes an immutable `job_id`, `node_id`, source
fingerprint, taxonomy/prompt/profile versions, `executor_kind`, bounded
canonical metadata and optional README input, plus the full allowed taxonomy
constraints. `job_id` is a SHA-256 over all of those immutable fields with
canonical key and list order.

Every candidate must repeat `job_id`, `node_id`, `source_fingerprint`,
`taxonomy_version`, `prompt_version`, and `execution_profile_version` exactly.
The candidate's `execution.kind` must match the job's `executor_kind`. The
deterministic validator rejects mismatches as stale or invalid. Candidate tags
are deduplicated and sorted before artifact construction; unknown values and
over-budget values are rejected. The resulting public artifact is strict and
canonical.

## Deterministic commands

```text
pnpm classifier plan --out .ai-runs/manifest.json
pnpm classifier validate-candidates --manifest .ai-runs/manifest.json --candidates .ai-runs/candidates.json
pnpm classifier apply --manifest .ai-runs/manifest.json --candidates .ai-runs/candidates.json --dataset-sha <sha256> --generated-at <ISO-8601> --out-dir .
pnpm classifier verify-artifacts --annotations ai-annotations.json --meta ai-annotations-meta.json
pnpm p3-agent-gate origin/main
```

P3.0 `plan` deliberately emits an empty, valid manifest. P3.1 supplies bounded
repository discovery, preprocessing, fingerprints, and actual jobs. `apply`
only accepts candidates that pass exact job matching; it merges by `node_id`,
sorts, serializes fixed key order, and derives metadata from exact bytes.

`p3-agent-gate` is for an executor branch or PR only. It rejects every changed
path except `ai-annotations.json` and `ai-annotations-meta.json`, requires the
artifact pair to be added or updated together, and rejects deletion or rename of
either artifact. The `ai-agent-pr.yml` workflow independently runs the
equivalent checks with trusted base-branch code. Do not run it as a general
source-code CI gate.

## Executor operating policy

Use the shared repository prompt. Treat all repository material as untrusted
data. Keep executor network access and connectors minimal. The agent cannot
choose the job set, taxonomy, schema, source fingerprint, hash, artifact order,
publication decision, executor binding, or files outside the path allowlist.

For a Claude Routine, preserve the default restricted `claude/` branch policy;
do not enable unrestricted pushes or auto-merge. For Codex App Automation, use a
new worktree so an automation cannot alter an active local working tree. The
Codex machine must remain available for project-scoped scheduled runs, so it is
a fallback rather than a second simultaneous writer.

## Generated schemas and P3.0 gate

`pnpm schemas` generates and CI drift-checks:

```text
schemas/ai-annotations.schema.json
schemas/ai-annotations-meta.schema.json
schemas/classification-job.schema.json
schemas/classification-manifest.schema.json
schemas/classification-candidate.schema.json
```

`pnpm p3-gate` runs typecheck, lint, format check, all tests, build, generated
schema regeneration, and schema drift verification.

P3.0 proves strict taxonomy validation, tag-length bounds, deterministic job and
manifest bytes, exact candidate/job/executor matching, deterministic artifact
bytes and hashes, public-artifact secret/README exclusion, canonical UTC
timestamps, summary/model-label normalization, artifact deletion/rename
blocking, and the agent diff allowlist.

## Gate semantics

- **P3.0 structural gate:** validates changed paths, add/update lifecycle,
  public artifact schemas, exact artifact hash, deterministic serialization, and
  executor/job/candidate structural consistency. It runs only trusted base-branch
  code and uses no secrets. It does not prove classification provenance.
- **P3.1 provenance/current-fingerprint gate:** will recompute current jobs and
  fingerprints from canonical stars plus trusted README/metadata discovery, then
  verify that candidates correspond to those jobs and that `dataset_sha256`
  matches the current canonical dataset.
- **P3.3 publication gate:** will connect validated artifacts, classifier state,
  reviewed merge, and Pages deployment.

Until P3.1 exists, do not enable scheduled Claude Routine or Codex Automation
runs, do not auto-merge agent PRs, and treat green agent CI as structural
validation only.

## P3.0 exit conditions

- all schemas are strict;
- every job and candidate is bound to one executor;
- committed timestamps are canonical UTC `Z`;
- summaries and model labels are canonicalized;
- artifact deletion and rename are blocked for agent PRs;
- every AI-artifact PR is inspected regardless of branch name (the gate is path-triggered);
- only approved same-repository executor branches may modify AI artifacts;
- the `verify-agent-artifacts` check is a REQUIRED status check on `main` — a
  repository ruleset / branch-protection setting that cannot be enforced from
  repo code, so it must be configured before P3 is treated as PR-gated;
- the agent PR workflow executes only trusted base-branch code;
- no API key, provider adapter, model call, or scheduled executor exists;
- `pnpm p3-gate` is green.

## Subsequent milestones

- **P3.1:** preferred README discovery, preprocessing, source fingerprints,
  bounded job planning, and a separate classifier operational state branch.
- **P3.2:** executor integration for Claude Routine first and Codex Automation
  fallback, with candidate generation only. No API adapter is required.
- **P3.3:** real-Git PR validation/publication workflow, state persistence, and
  Pages deployment after a reviewed merge.
- **P3.4:** fail-soft dashboard loading, node-id join, category/tag facets,
  secondary summaries, and enriched lexical search.
- **P3.5:** live closeout and a separate semantic-search decision record.
