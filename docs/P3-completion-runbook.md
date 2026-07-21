# P3 completion runbook — the owner-only credentialed no-churn gate

P3 (AI classification) is **implementation-, publication-, and visual-UI-complete**, and the
deterministic no-churn replay is verified offline (`assemble.ts` ART-3; `planner.ts` README-2 /
PLAN-2 / NOCHURN-1). Exactly **one** step remains before P3 may be marked `✅ complete`, and it can
only be run by the owner because it needs a real GitHub token: a **credentialed, full-corpus,
zero-job** live planner replay. This runbook is that step. See `docs/P3-ai-spec.md` (§P3.5
Operational closeout) for the contract this satisfies.

> This runbook does **not** run the replay for you (it needs your credential) and it does **not**
> mark P3 complete on its own — it is the procedure + the pass/fail evidence + the exact spec edit.

## Completion condition (ALL must hold)

```text
current annotations   = ai-annotations.json           (the full published set, not a subset)
scope                 = full corpus                    (planned against the whole stars.json)
backlog (node_id set) = missing=0, extra=0, duplicates=0  (canonical identity SET equality, not a count)
planned jobs          = 0                              (the manifest has zero jobs)
omitted-unfetchable   = 0                              (no README-probe-ok-but-unfetchable repos)
credentialed run      = succeeded with a real token
run URL               = recorded in docs/P3-ai-spec.md
```

The gate is the **conjunction**. A zero-job manifest that is missing any of the other rows is
**not** a completion.

## Prerequisite: the backlog must already be zero

Run this only **after** the classification backlog is truly drained. The classifier joins
annotations to canonical repos by **`node_id`** (the planner's join key,
`packages/classifier/src/planner.ts` — `annByNode.get(repo.node_id)`). A count check
(`stars.length − annotations.length === 0`) is **insufficient**: a missing annotation and a
stray/duplicate one cancel to zero. Compare the `node_id` **sets**:

```bash
node -e "
const stars=require('./stars.json').repos, anns=require('./ai-annotations.json').annotations;
const S=new Set(stars.map(r=>r.node_id));
const seen=new Map(); for(const a of anns) seen.set(a.node_id,(seen.get(a.node_id)||0)+1);
const A=new Set(seen.keys());
const missing=[...S].filter(id=>!A.has(id)).length;   // starred but unannotated
const extra=[...A].filter(id=>!S.has(id)).length;     // annotated but not a current star
const duplicates=[...seen.values()].reduce((n,c)=>n+(c-1),0);
console.log('stars='+S.size,'annotations='+anns.length);
console.log('missing='+missing,'extra='+extra,'duplicates='+duplicates);
console.log(missing===0&&extra===0&&duplicates===0 ? 'BACKLOG DRAINED' : 'NOT DRAINED — do not proceed');
"
# proceed ONLY when: missing=0 AND extra=0 AND duplicates=0
```

Anything other than all-zero means the backlog is not truly drained or the annotation set has
drifted (missing, extra, or duplicate identities) — running the replay now is **not** a completion;
fix the drift or wait for the drain.

## The command (verified against `packages/classifier/src/program.ts`)

Required secret — **name only**, never paste the value into a file, PR, log, or this repo:
`STAR_SYNC_TOKEN` (a read-only fine-grained PAT, `Starring: read`; `GITHUB_TOKEN` is also accepted).

```bash
# From the repo root, on current main, with the backlog at zero.
# --out writes a throwaway manifest; --current is the full published annotation set.
# stars.json / dataset-meta.json / config/ai.yaml are picked up by default.
# DO NOT pass --save-state: this is a read-only verification, not a state-branch update.
STAR_SYNC_TOKEN=*** pnpm classifier plan \
  --current ai-annotations.json \
  --out .ai-runs/completion-check-manifest.json
```

The `plan` command performs **live README discovery** through the GitHub API with the token
(`OctokitReadmeSource`), which is exactly what makes this the credentialed replay the offline
fixtures cannot substitute for.

### For the "hosted run URL" the gate requires — one approved path

The completion condition requires a **hosted** run URL, not just local terminal output. The one
approved way to obtain it is a **dedicated, read-only `workflow_dispatch` completion-check job** —
**not** a reuse of the stateful `ai-state` executor. Reasons: the completion replay forbids
`--save-state`; the verification job must write no branch/state; and the audit evidence must be a
clean, side-effect-free run whose URL, SHA, and log are unambiguous. Build that workflow later, in
its own narrow PR once the backlog is drained; it must be bounded to:

```yaml
on:
  workflow_dispatch:
permissions:
  contents: read
```

and additionally: check out the **default/protected** branch (accept no arbitrary `ref` input); do
**not** pass `--save-state`; write/commit no state; open no PR; hold no write permission; use the
token only for live README reads; keep the manifest as a short-lived run artifact / step-summary
evidence. A local run is a fine pre-check, but the recorded gate evidence is this hosted run's URL.

## What PASS looks like

stdout ends with exactly:

```text
wrote manifest with 0 job(s) (dataset <sha12>…): .ai-runs/completion-check-manifest.json
```

with **no** `omitted N probe-ok job(s) …` line, and the written manifest has:

```json
{ "jobs": [] }
```

That — together with the **all-zero** backlog set-check above and a real token — is the full pass.
Also record the run's **base commit SHA** and the **dataset SHA** (the `<sha12>…` the command
prints), so the "0 jobs" result is pinned to a specific corpus version and cannot be blurred by
`main` moving afterward.

## Failure interpretations

| stdout / result                               | Meaning                                                                                      | Not a completion because…                        |
| --------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `wrote manifest with N job(s)` (N > 0)        | The planner found new/changed/retry-due repos.                                               | Non-zero jobs.                                   |
| `omitted M probe-ok job(s) …` line present    | Some repos' README **bytes** were not fetchable this run; they re-plan next run.             | The "0 jobs" is masking un-drained work (M > 0). |
| `a GitHub token (STAR_SYNC_TOKEN …) required` | No token in env.                                                                             | Not credentialed.                                |
| throws on `stars.json` / `dataset-meta.json`  | Corrupt/absent canonical data.                                                               | Fail-closed; fix data first.                     |
| `AI classification disabled …`                | `config/ai.yaml` has `ai.enabled=false`; an empty manifest is written **without** discovery. | No live discovery ran; not the replay.           |

## The five false-completions to reject

1. A **scoped-subset** replay (planning against only the already-annotated repos) that returns zero.
2. A **local-only simulation** or fixture run with no real token.
3. A zero-**new** result taken while the **backlog is not yet drained** (`remaining > 0`).
4. Any **non-credentialed** validation.
5. Inferring completion from "the routine opened no PR today" instead of an actual full-corpus
   zero-job planner run.

## Spec update template (apply only after a genuine PASS)

Open a **narrow, docs-only** PR that touches **only** `docs/P3-ai-spec.md` (do not fold in any
other roadmap change). In the §P3.5 "Operational closeout" live-half bullet, replace the ⏳ PENDING
line with:

```markdown
- ✅ **No-churn replay, live half — DONE (credentialed, full-corpus).** On <YYYY-MM-DD> a
  full-corpus `pnpm classifier plan --current ai-annotations.json` run against live README OIDs
  emitted **0 jobs** and **0 omitted-unfetchable** with the backlog drained (node_id set equality:
  missing/extra/duplicates all 0; <N> of <N> annotated). Hosted run: <ACTIONS_RUN_URL> at base
  `<BASE_SHA>`, dataset `<DATASET_SHA>`. P3 is therefore **✅ complete**.
```

Then update the README P3 status cell from "Pending closeout: backlog drain + one owner-run
credentialed no-churn planner replay" to `✅ complete`, and the P3 spec's "P3 exit conditions"
intro to drop the two now-satisfied pending items. Nothing else in that PR.
