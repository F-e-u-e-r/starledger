import { DeferredError, type RawRepoNode, type StarredRestClient } from '@starred/github-client';
import { describe, expect, it } from 'vitest';
import { enumerate } from '../src/enumerate';
import {
  fakeGraphql,
  fakeRest,
  httpError,
  makeRawEdge,
  makeRawNode,
  makeStarRow,
  makeTestCoordinator,
} from './helpers';

describe('enumerate — GraphQL path (LIM-1)', () => {
  it('LIM-1: isOverLimit=false uses GraphQL and returns all edges', async () => {
    const edges = [
      makeRawEdge('2026-01-01T00:00:00Z', { id: 'R_1', nameWithOwner: 'a/1' }),
      makeRawEdge('2026-02-01T00:00:00Z', { id: 'R_2', nameWithOwner: 'a/2' }),
    ];
    const result = await enumerate(
      { graphql: fakeGraphql({ isOverLimit: false, edges }), rest: fakeRest([]) },
      { coordinator: makeTestCoordinator() },
    );
    expect(result.source).toBe('graphql');
    expect(result.edges).toHaveLength(2);
    expect(result.enumeratedCount).toBe(2);
    expect(result.failedRecords).toHaveLength(0);
    expect(result.removedMidRun).toBe(0);
  });
});

describe('enumerate — REST fallback (LIM-2 / LIM-3 / I1)', () => {
  it('LIM-2: isOverLimit=true enumerates via REST and hydrates by node_id', async () => {
    const nodesById = new Map<string, RawRepoNode>([
      ['R_1', makeRawNode({ id: 'R_1', nameWithOwner: 'a/1' })],
      ['R_2', makeRawNode({ id: 'R_2', nameWithOwner: 'a/2' })],
    ]);
    const rest = fakeRest([
      {
        rows: [
          makeStarRow('R_1', '2026-05-01T00:00:00Z'),
          makeStarRow('R_2', '2026-03-01T00:00:00Z'),
        ],
        linkHeader: null,
      },
    ]);
    const result = await enumerate(
      { graphql: fakeGraphql({ isOverLimit: true, nodesById }), rest },
      { coordinator: makeTestCoordinator() },
    );
    expect(result.source).toBe('rest-fallback');
    expect(result.edges).toHaveLength(2);
    expect(result.enumeratedAfterDedup).toBe(2);
    expect(result.edges.map((e) => e.starredAt).sort()).toEqual([
      '2026-03-01T00:00:00Z',
      '2026-05-01T00:00:00Z',
    ]);
  });

  it('counts removed_mid_run when a node is null after enumeration', async () => {
    const nodesById = new Map<string, RawRepoNode>([
      ['R_1', makeRawNode({ id: 'R_1', nameWithOwner: 'a/1' })],
    ]);
    const rest = fakeRest([
      {
        rows: [
          makeStarRow('R_1', '2026-05-01T00:00:00Z'),
          makeStarRow('R_gone', '2026-04-01T00:00:00Z'),
        ],
        linkHeader: null,
      },
    ]);
    const result = await enumerate(
      { graphql: fakeGraphql({ isOverLimit: true, nodesById }), rest },
      { coordinator: makeTestCoordinator() },
    );
    expect(result.edges).toHaveLength(1);
    expect(result.removedMidRun).toBe(1);
    expect(result.enumeratedCount).toBe(2);
  });

  it('LIM-3: a permanently failing REST page is deferred (exit 20), never truncated', async () => {
    const rest: StarredRestClient = {
      async fetchStarredPage() {
        throw httpError(503, 'service unavailable');
      },
    };
    await expect(
      enumerate(
        { graphql: fakeGraphql({ isOverLimit: true }), rest },
        { coordinator: makeTestCoordinator({ maxAttempts: 2 }) },
      ),
    ).rejects.toBeInstanceOf(DeferredError);
  });
});
