import { describe, expect, it } from 'vitest';
import { checkFreshness, compareFreshness, parseLiveStarsSha } from '../src/freshness';

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);

const validLiveMeta = JSON.stringify({
  schema_version: '1.0',
  dataset_generated_at: '2026-07-07T00:00:00.000Z',
  stars_sha256: SHA_A,
  repo_count: 550,
});

/** A fetch stub returning a fixed body/status; enough of Response for the guard. */
function mockFetch(body: string, ok = true, status = 200): typeof fetch {
  return (async () => ({ ok, status, text: async () => body })) as unknown as typeof fetch;
}

const URL = 'https://example.github.io/repo/dataset-meta.json';

describe('deploy freshness guard (OPS-A)', () => {
  it('MATCH: live fingerprint equals main HEAD → fresh', async () => {
    const r = await checkFreshness({
      url: URL,
      expectedSha: SHA_A,
      fetchImpl: mockFetch(validLiveMeta),
    });
    expect(r.status).toBe('fresh');
    expect(r.liveSha).toBe(SHA_A);
  });

  it('MISMATCH: live differs from main HEAD → drift (both fingerprints surfaced)', async () => {
    const r = await checkFreshness({
      url: URL,
      expectedSha: SHA_B,
      fetchImpl: mockFetch(validLiveMeta),
    });
    expect(r.status).toBe('drift');
    expect(r.liveSha).toBe(SHA_A);
    expect(r.expectedSha).toBe(SHA_B);
  });

  it('MISSING live meta: HTTP 404 → throws (cannot conclude fresh)', async () => {
    await expect(
      checkFreshness({
        url: URL,
        expectedSha: SHA_A,
        fetchImpl: mockFetch('not found', false, 404),
      }),
    ).rejects.toThrow(/HTTP 404/);
  });

  it('MALFORMED live meta: invalid JSON → throws', async () => {
    await expect(
      checkFreshness({ url: URL, expectedSha: SHA_A, fetchImpl: mockFetch('{not json') }),
    ).rejects.toThrow(/not valid JSON/);
  });

  it('MALFORMED live meta: valid JSON but fails the dataset-meta schema → throws', () => {
    expect(() => parseLiveStarsSha(JSON.stringify({ stars_sha256: 'short' }))).toThrow(
      /schema validation/,
    );
  });

  it('NETWORK failure: fetch rejects → throws (never silently "fresh")', async () => {
    const failing = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    await expect(
      checkFreshness({ url: URL, expectedSha: SHA_A, fetchImpl: failing }),
    ).rejects.toThrow(/could not reach/);
  });

  it('compareFreshness is pure', () => {
    expect(compareFreshness(SHA_A, SHA_A).status).toBe('fresh');
    expect(compareFreshness(SHA_A, SHA_B).status).toBe('drift');
  });
});
