import { describe, expect, it } from 'vitest';
import { CandidateValidationError, validateCandidate } from '../src/validate-candidate';
import { makeCandidate, makeJob } from '../../ai-schema/tests/helpers';

describe('candidate validation', () => {
  it('CAND-1: a candidate that exactly matches its job is accepted and normalized', () => {
    const job = makeJob();
    const candidate = makeCandidate(job, { tags: ['cli', 'automation', 'cli'] });
    const validated = validateCandidate(candidate, job);
    expect(validated.tags).toEqual(['automation', 'cli']);
  });

  it('CAND-2: a stale source fingerprint is rejected', () => {
    const job = makeJob();
    const candidate = makeCandidate(job, { source_fingerprint: 'c'.repeat(64) });
    expect(() => validateCandidate(candidate, job)).toThrow(CandidateValidationError);
  });

  it('CAND-3: a wrong node_id or job_id is rejected', () => {
    const job = makeJob();
    expect(() => validateCandidate(makeCandidate(job, { node_id: 'R_other' }), job)).toThrow(
      CandidateValidationError,
    );
    expect(() =>
      validateCandidate(makeCandidate(job, { job_id: `sha256:${'d'.repeat(64)}` }), job),
    ).toThrow(CandidateValidationError);
  });

  it('CAND-4: Claude Routine and Codex Automation candidates use the same contract', () => {
    const job = makeJob();
    const claude = validateCandidate(makeCandidate(job), job);
    const codex = validateCandidate(
      makeCandidate(job, {
        execution: {
          kind: 'codex-automation',
          profile_version: 'agent-v1',
          model_label: 'gpt-5.5',
        },
      }),
      job,
    );
    expect(claude.tags).toEqual(codex.tags);
  });
});
