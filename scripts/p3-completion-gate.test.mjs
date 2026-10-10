// Unit tests for the PURE P3 completion gate decision (./p3-completion-gate.mjs).
//
// The gate is an ORACLE (it decides "P3 is complete"), so these include
// FALSIFICATION cases — scenarios the gate MUST reject — not only a happy path.
// The central one reproduces issue #207 item 2: a changed-fingerprint repo under
// a 0 refresh/retry budget yields "jobs = 0 + node_id sets equal", which the old
// gate passed but which is NOT completion.
import { describe, expect, it } from 'vitest';
import { evaluateP3Completion } from './p3-completion-gate.mjs';

const STARS = [{ node_id: 'R_a' }, { node_id: 'R_b' }];
const ANNS = [{ node_id: 'R_a' }, { node_id: 'R_b' }]; // node_id sets equal

const DRAINED = {
  eligible_new: 0,
  eligible_retry: 0,
  eligible_refresh: 0,
  omitted_unfetchable: 0,
  deferred_retry: 0,
  empty_reason: 'drained-at-base',
};

function manifest(plan_summary, jobs = []) {
  return { dataset_sha256: 'd'.repeat(64), jobs, plan_summary };
}

function evalWith(overrides = {}) {
  return evaluateP3Completion({
    stars: STARS,
    annotations: ANNS,
    manifest: manifest(DRAINED),
    planExitStatus: 0,
    ...overrides,
  });
}

describe('P3 completion gate — pure decision', () => {
  it('PASS: drained-at-base, equal node_id sets, zero eligible/omitted', () => {
    const r = evalWith();
    expect(r.pass).toBe(true);
    expect(r.problems).toEqual([]);
    expect(r.metrics).toMatchObject({
      jobs: 0,
      missing: 0,
      extra: 0,
      duplicates: 0,
      emptyReason: 'drained-at-base',
    });
  });

  // ---- FALSIFICATION: the gate MUST be able to FAIL, not merely pass ----

  it('FALSIFY #207: budget-masked refresh (jobs=0, node_id sets equal) FAILS', () => {
    // The exact unsound scenario the old gate passed: a changed-fingerprint repo
    // bucketed refresh, dropped by a 0 refresh ceiling → 0 jobs, still annotated
    // → node_id sets equal. plan_summary exposes the masked work.
    const r = evalWith({
      manifest: manifest({ ...DRAINED, eligible_refresh: 1, empty_reason: 'zero-budget' }),
    });
    expect(r.pass).toBe(false);
    expect(r.problems.join(' ')).toMatch(/eligible_refresh = 1/);
    expect(r.problems.join(' ')).toMatch(/drained-at-base/);
  });

  it('FALSIFY: budget-masked retry FAILS', () => {
    const r = evalWith({
      manifest: manifest({ ...DRAINED, eligible_retry: 2, empty_reason: 'zero-budget' }),
    });
    expect(r.pass).toBe(false);
    expect(r.problems.join(' ')).toMatch(/eligible_retry = 2/);
  });

  it('FALSIFY: new work pending FAILS', () => {
    const r = evalWith({
      manifest: manifest({ ...DRAINED, eligible_new: 3, empty_reason: 'zero-budget' }),
    });
    expect(r.pass).toBe(false);
    expect(r.problems.join(' ')).toMatch(/eligible_new = 3/);
  });

  it('FALSIFY: disabled executor (no live discovery ran) FAILS', () => {
    const r = evalWith({ manifest: manifest({ ...DRAINED, empty_reason: 'disabled' }) });
    expect(r.pass).toBe(false);
    expect(r.problems.join(' ')).toMatch(/empty_reason = "disabled"/);
  });

  it('FALSIFY: all-omitted (masking un-drained work) FAILS', () => {
    const r = evalWith({
      manifest: manifest({ ...DRAINED, omitted_unfetchable: 3, empty_reason: 'all-omitted' }),
    });
    expect(r.pass).toBe(false);
    expect(r.problems.join(' ')).toMatch(/omitted-unfetchable = 3/);
  });

  it('FALSIFY: retry-backoff residual (deferred, excluded from eligible_*) FAILS', () => {
    // A stale-annotated repo in retry backoff is a SKIP bucket, so it is absent
    // from eligible_* and from jobs; without the deferred_retry assertion +
    // 'deferred' reason this would falsely read as drained-at-base (issue #207).
    const r = evalWith({
      manifest: manifest({ ...DRAINED, deferred_retry: 1, empty_reason: 'deferred' }),
    });
    expect(r.pass).toBe(false);
    expect(r.problems.join(' ')).toMatch(/deferred_retry = 1/);
    expect(r.problems.join(' ')).toMatch(/drained-at-base/);
  });

  it('FALSIFY: absent plan_summary fails closed (old classifier)', () => {
    const r = evalWith({ manifest: { dataset_sha256: 'd'.repeat(64), jobs: [] } });
    expect(r.pass).toBe(false);
    expect(r.problems.join(' ')).toMatch(/no plan_summary/);
  });

  // ---- regression: the original set/jobs/exit checks still bind ----

  it('FAIL: node_id set inequality (missing) caught', () => {
    const r = evalWith({ stars: [...STARS, { node_id: 'R_c' }] });
    expect(r.pass).toBe(false);
    expect(r.problems.join(' ')).toMatch(/missing=1/);
  });

  it('FAIL: extra (orphan) annotation caught', () => {
    const r = evalWith({ annotations: [...ANNS, { node_id: 'R_x' }] });
    expect(r.pass).toBe(false);
    expect(r.problems.join(' ')).toMatch(/extra=1/);
  });

  it('FAIL: duplicate annotation caught', () => {
    const r = evalWith({ annotations: [...ANNS, { node_id: 'R_a' }] });
    expect(r.pass).toBe(false);
    expect(r.problems.join(' ')).toMatch(/duplicates=1/);
  });

  it('FAIL: planned jobs > 0 caught (empty_reason null when jobs present)', () => {
    const r = evalWith({
      manifest: {
        dataset_sha256: 'd'.repeat(64),
        jobs: [{ node_id: 'R_a' }],
        plan_summary: { ...DRAINED, eligible_new: 1, empty_reason: null },
      },
    });
    expect(r.pass).toBe(false);
    expect(r.problems.join(' ')).toMatch(/planned jobs = 1/);
  });

  it('FAIL: plan exit nonzero caught', () => {
    const r = evalWith({ planExitStatus: 10 });
    expect(r.pass).toBe(false);
    expect(r.problems.join(' ')).toMatch(/plan exited 10/);
  });

  it('FAIL: unreadable manifest caught', () => {
    const r = evalWith({ manifest: null });
    expect(r.pass).toBe(false);
    expect(r.problems.join(' ')).toMatch(/unreadable manifest/);
  });
});
