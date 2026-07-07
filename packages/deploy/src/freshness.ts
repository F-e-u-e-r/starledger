import { DatasetMetaSchema } from '@starred/schema';

/**
 * Deploy-freshness guard (OPS-A). The daily sync commits fresh data to main and
 * relies on a workflow-triggering push token to fire pages.yml. If that
 * invariant ever breaks (e.g. someone swaps the App token for GITHUB_TOKEN), the
 * commit still lands but NO deploy runs — the live site silently freezes on
 * stale data with no failed run to notice. This guard makes that failure
 * OBSERVABLE by comparing the live site's published fingerprint against main
 * HEAD. It is strictly read-only: no writes, no secret, only the public artifact.
 */

export interface FreshnessResult {
  status: 'fresh' | 'drift';
  /** stars_sha256 the live site is currently serving. */
  liveSha: string;
  /** stars_sha256 committed at main HEAD — what the site SHOULD be serving. */
  expectedSha: string;
}

/**
 * Parse a fetched dataset-meta.json body and return its stars_sha256, validated
 * against the canonical schema. Throws (fail-closed) on malformed JSON or a body
 * that does not satisfy the committed contract: a monitor that cannot read the
 * live fingerprint must alarm, never silently conclude "fresh".
 */
export function parseLiveStarsSha(liveMetaText: string): string {
  let raw: unknown;
  try {
    raw = JSON.parse(liveMetaText);
  } catch {
    throw new Error('live dataset-meta.json is not valid JSON');
  }
  const parsed = DatasetMetaSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error('live dataset-meta.json failed dataset-meta schema validation');
  }
  return parsed.data.stars_sha256;
}

/** Pure comparison of the live fingerprint against the expected (main HEAD) one. */
export function compareFreshness(liveSha: string, expectedSha: string): FreshnessResult {
  return { status: liveSha === expectedSha ? 'fresh' : 'drift', liveSha, expectedSha };
}

export interface CheckFreshnessOptions {
  /** Absolute URL of the live dataset-meta.json, e.g. https://<owner>.github.io/<repo>/dataset-meta.json. */
  url: string;
  /** The stars_sha256 committed at main HEAD — what the live site should be serving. */
  expectedSha: string;
  /** Injectable for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

/**
 * Fetch the live dataset-meta.json and compare its fingerprint to main HEAD. A
 * network failure or non-200 THROWS — the monitor cannot conclude "fresh" from
 * an unreachable site, and a false "fresh" would defeat the guard's whole point.
 */
export async function checkFreshness(opts: CheckFreshnessOptions): Promise<FreshnessResult> {
  const doFetch = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(opts.url);
  } catch (err) {
    throw new Error(
      `could not reach the live site (${opts.url}): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  if (!res.ok) {
    throw new Error(`live dataset-meta.json → HTTP ${res.status} (${opts.url})`);
  }
  const liveSha = parseLiveStarsSha(await res.text());
  return compareFreshness(liveSha, opts.expectedSha);
}
