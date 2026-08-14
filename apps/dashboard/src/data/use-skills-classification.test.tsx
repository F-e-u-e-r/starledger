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

  it('K4a: a REPLACED loader resets to loading first — no stale state during the new flight', async () => {
    let resolveSecond: (value: LoadedSkillsClassification | null) => void = () => {};
    const first: () => Promise<LoadedSkillsClassification | null> = async () => loaded();
    const second = () =>
      new Promise<LoadedSkillsClassification | null>((resolve) => {
        resolveSecond = resolve;
      });
    const { result, rerender } = renderHook(
      ({ loader }: { loader: () => Promise<LoadedSkillsClassification | null> }) =>
        useSkillsClassification(loader),
      { initialProps: { loader: first } },
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    rerender({ loader: second });
    await waitFor(() => expect(result.current.status).toBe('loading'));
    expect(result.current.data).toBeNull();
    resolveSecond(null);
    await waitFor(() => expect(result.current.status).toBe('unavailable'));
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
