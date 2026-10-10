// Pure decision logic for the P3 completion gate, factored out of
// scripts/p3-completion-check.mjs so it is unit-testable in isolation — including
// the FALSIFICATION case for the budget-masked-work soundness hole (issue #207
// item 2). No IO, no dependencies: it takes already-parsed inputs and returns a
// verdict, so a test can drive it with hand-built fixtures.

/**
 * Evaluate the P3 completion condition from parsed inputs.
 *
 * Soundness (issue #207 item 2): with `max_refresh_per_run`/`max_retry_per_run`
 * at 0, a changed-fingerprint repo is bucketed as refresh/retry but truncated to
 * zero jobs while staying annotated — so "planned jobs = 0 AND node_id sets
 * equal" FALSELY reads as completion. The fix is to trust the planner's
 * machine-readable `plan_summary` (issue #207 item 1): completion requires
 * `empty_reason === 'drained-at-base'` and zero eligible/omitted work, not just
 * an empty jobs array.
 *
 * @param {{
 *   stars: Array<{ node_id: string }>,
 *   annotations: Array<{ node_id: string }>,
 *   manifest: unknown,
 *   planExitStatus: number,
 * }} input
 * @returns {{ pass: boolean, problems: string[], metrics: object }}
 */
export function evaluateP3Completion({ stars, annotations, manifest, planExitStatus }) {
  const problems = [];

  // 1. Canonical identity (node_id) set equality — the planner's join key.
  const starIds = new Set(stars.map((r) => r.node_id));
  const seen = new Map();
  for (const a of annotations) seen.set(a.node_id, (seen.get(a.node_id) ?? 0) + 1);
  const annIds = new Set(seen.keys());
  const missing = [...starIds].filter((id) => !annIds.has(id)).length; // starred but unannotated
  const extra = [...annIds].filter((id) => !starIds.has(id)).length; // annotated but not a current star
  const duplicates = [...seen.values()].reduce((n, c) => n + (c - 1), 0);
  if (missing !== 0 || extra !== 0 || duplicates !== 0) {
    problems.push(
      `backlog not drained (node_id sets: missing=${missing}, extra=${extra}, duplicates=${duplicates})`,
    );
  }

  // 2. The live plan must have succeeded.
  if (planExitStatus !== 0) problems.push(`classifier plan exited ${planExitStatus}`);

  // 3. Jobs + dataset SHA from the manifest (never print its content).
  const hasJobs = manifest && Array.isArray(manifest.jobs);
  const jobs = hasJobs ? manifest.jobs.length : Number.NaN;
  const datasetSha =
    manifest && typeof manifest.dataset_sha256 === 'string' ? manifest.dataset_sha256 : 'unknown';
  if (!hasJobs) problems.push('unreadable manifest (no jobs array)');
  else if (jobs !== 0) problems.push(`planned jobs = ${jobs} (want 0)`);

  // 4. Machine-readable plan diagnostics (issue #207). Absent ⇒ FAIL CLOSED: a
  // classifier predating these fields cannot prove refresh/retry work was not
  // masked by a 0 budget, nor that discovery actually ran.
  const ps = manifest && manifest.plan_summary;
  if (ps === undefined || ps === null) {
    problems.push(
      'manifest has no plan_summary — classifier predates machine-readable diagnostics; ' +
        'cannot prove no budget-masked work (fail closed)',
    );
  } else {
    // The soundness assertions. Each eligible_* > 0 is un-drained work that a 0
    // budget would hide behind an empty jobs array.
    if (ps.eligible_new !== 0)
      problems.push(`eligible_new = ${ps.eligible_new} (want 0; new work remains)`);
    if (ps.eligible_retry !== 0)
      problems.push(`eligible_retry = ${ps.eligible_retry} (want 0; retry work budget-masked)`);
    if (ps.eligible_refresh !== 0)
      problems.push(
        `eligible_refresh = ${ps.eligible_refresh} (want 0; refresh work budget-masked)`,
      );
    if (ps.omitted_unfetchable !== 0)
      problems.push(
        `omitted-unfetchable = ${ps.omitted_unfetchable} (want 0; masking un-drained work)`,
      );
    // Retry-backoff repos are a skip bucket excluded from eligible_*, so assert
    // them explicitly — a stale-annotated repo in backoff is un-drained work that
    // a jobs==0 + node_id-set-equal check alone would falsely pass (issue #207).
    if (ps.deferred_retry !== 0)
      problems.push(`deferred_retry = ${ps.deferred_retry} (want 0; retry backoff pending)`);
    // 'drained-at-base' is the ONLY empty_reason that means completion; it rejects
    // 'disabled' (no live discovery) and 'deferred' (retry-backoff/terminal
    // residual), replacing the old stdout "AI classification disabled" /
    // "omitted N probe-ok" prose parsing and backstopping any non-current residual.
    if (ps.empty_reason !== 'drained-at-base') {
      problems.push(
        `empty_reason = ${JSON.stringify(ps.empty_reason ?? null)} (want "drained-at-base")`,
      );
    }
  }

  return {
    pass: problems.length === 0,
    problems,
    metrics: {
      starCount: starIds.size,
      annCount: annotations.length,
      missing,
      extra,
      duplicates,
      jobs,
      datasetSha,
      eligibleNew: ps ? ps.eligible_new : null,
      eligibleRetry: ps ? ps.eligible_retry : null,
      eligibleRefresh: ps ? ps.eligible_refresh : null,
      omitted: ps ? ps.omitted_unfetchable : null,
      deferredRetry: ps ? ps.deferred_retry : null,
      emptyReason: ps ? (ps.empty_reason ?? null) : null,
    },
  };
}
