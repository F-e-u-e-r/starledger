// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { LoadedSkillsClassification } from './load-skills-classification';
import { useSkillsClassification } from './use-skills-classification';

function loaded(): LoadedSkillsClassification {
  return {
    byNodeId: new Map([
      [
        'R_kgDOhook0001',
        {
          primaryCategoryId: 'verification-qa',
          secondaryCategoryIds: [],
          summary: 'Hook fixture.',
        },
      ],
    ]),
    categories: [],
    scope: { id: 'coding-agent-skills-ecosystem', label: 'x', description: 'y' },
    taxonomyVersion: 'skills-1',
    generatedAt: '2026-08-14T00:00:00Z',
    generatedAgainstStarsSha256: 'c'.repeat(64),
    coverage: { matched: 1, unclassified: 0, unresolved: 0 },
  };
}

describe('useSkillsClassification — availability state machine (§4.10, locked decision 1)', () => {
  it('MATRIX-8: stays `loading` while the load is in flight — never mislabeled unavailable', async () => {
    let resolveLoad: (value: LoadedSkillsClassification | null) => void = () => {};
    const pending = new Promise<LoadedSkillsClassification | null>((resolve) => {
      resolveLoad = resolve;
    });
    const stablePending = () => pending;
    const { result } = renderHook(() => useSkillsClassification(stablePending));
    expect(result.current.status).toBe('loading');
    expect(result.current.data).toBeNull();
    resolveLoad(loaded());
    await waitFor(() => expect(result.current.status).toBe('ready'));
  });

  it('loading → ready with the loaded data exposed', async () => {
    const stableReady = async () => loaded();
    const { result } = renderHook(() => useSkillsClassification(stableReady));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.data?.byNodeId.get('R_kgDOhook0001')?.summary).toBe('Hook fixture.');
  });

  it('loading → unavailable when the loader resolves null (definitive failure)', async () => {
    const stableNull = async () => null;
    const { result } = renderHook(() => useSkillsClassification(stableNull));
    await waitFor(() => expect(result.current.status).toBe('unavailable'));
    expect(result.current.data).toBeNull();
  });

  /**
   * CONTRACT CHANGE (owner ruling, review finding F3). This test previously
   * pinned the opposite behaviour — "a REPLACED loader resets to loading
   * first" — which made loader IDENTITY an implicit reload signal. That is the
   * mechanism behind the unbounded load↔render cycle pinned by F3-LOOP below,
   * and production never had the feature it protected (App passes no loader
   * outside tests). The lifecycle is now anchored to mount; a reload would be
   * an explicit trigger, never an accident of referential identity.
   */
  it('K4a: a REPLACED loader does NOT restart the lifecycle — identity is not a reload signal', async () => {
    let secondCalls = 0;
    const first: () => Promise<LoadedSkillsClassification | null> = async () => loaded();
    const second: () => Promise<LoadedSkillsClassification | null> = async () => {
      secondCalls += 1;
      return null;
    };
    const { result, rerender } = renderHook(
      ({ loader }: { loader: () => Promise<LoadedSkillsClassification | null> }) =>
        useSkillsClassification(loader),
      { initialProps: { loader: first } },
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));

    rerender({ loader: second });
    await new Promise((r) => setTimeout(r, 20));

    expect(secondCalls).toBe(0);
    expect(result.current.status).toBe('ready');
    expect(result.current.data).not.toBeNull();
  });

  /**
   * PRODUCTION DEFAULT PATH (review finding). Every other hook and App test
   * INJECTS a loader, so the branch production actually takes — no loader, fall
   * through to the real `loadSkillsClassification` — was never executed. A
   * broken default would leave classification permanently unloaded in
   * production while the entire suite stayed green.
   */
  it('DEFAULT-PATH: with no loader injected, the real loader is driven against the artifacts', async () => {
    const requested: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      requested.push(String(input));
      return new Response('', { status: 404 });
    }) as typeof fetch;
    try {
      const { result } = renderHook(() => useSkillsClassification());
      await waitFor(() => expect(result.current.status).toBe('unavailable'));
    } finally {
      globalThis.fetch = original;
    }
    // The default branch must reach the real artifact, not silently no-op.
    expect(requested.some((url) => url.includes('skills-classification-meta.json'))).toBe(true);
  });

  it('F3-LOOP: an unstable inline loader does not scale load count with rerender count', async () => {
    let calls = 0;
    // An inline arrow: a NEW function identity on every single render.
    const { rerender } = renderHook(() =>
      useSkillsClassification(() => {
        calls += 1;
        return Promise.resolve(null);
      }),
    );

    await new Promise((r) => setTimeout(r, 50));
    const afterMount = calls;

    // Bounded per lifecycle rather than exactly 1 — StrictMode may double-invoke
    // mount effects, and this contract must not be pinned to a development-mode
    // detail. What it MUST exclude is growth.
    expect(afterMount).toBeGreaterThan(0);
    expect(afterMount).toBeLessThanOrEqual(2);

    for (let i = 0; i < 50; i += 1) rerender();
    await new Promise((r) => setTimeout(r, 50));

    // The decisive assertion: 50 further renders add ZERO loads. Before the fix
    // this counter reached the thousands without any rerender() calls at all,
    // because each settled load minted a new identity and restarted the effect.
    expect(calls).toBe(afterMount);
  });

  it('K4b: a synchronously THROWING loader lands in unavailable, never an unhandled escape', async () => {
    const stableThrowing = () => {
      throw new Error('sync boom');
    };
    const { result } = renderHook(() => useSkillsClassification(stableThrowing));
    await waitFor(() => expect(result.current.status).toBe('unavailable'));
    expect(result.current.data).toBeNull();
  });

  it('loading → unavailable when the loader rejects', async () => {
    const stableRejecting = () => Promise.reject(new Error('boom'));
    const { result } = renderHook(() => useSkillsClassification(stableRejecting));
    await waitFor(() => expect(result.current.status).toBe('unavailable'));
    expect(result.current.data).toBeNull();
  });
});
