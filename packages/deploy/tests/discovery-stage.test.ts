import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DISCOVERY_CANDIDATES_FILE,
  DISCOVERY_CANDIDATES_META_FILE,
  stageDiscoveryArtifacts,
} from '../src/stage';

function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function validArtifactPair(): { candidates: string; meta: string } {
  const candidates =
    JSON.stringify(
      {
        schema_version: 1,
        candidates: [
          {
            node_id: 'R_1',
            owner: 'owner',
            name: 'repo',
            full_name: 'owner/repo',
            html_url: 'https://github.com/owner/repo',
            description: 'A test repo',
            homepage_url: null,
            primary_language: 'TypeScript',
            stargazer_count: 100,
            archived: false,
            disabled: false,
            fork: false,
            pushed_at: '2026-01-01T00:00:00.000Z',
            discovered_at: '2026-01-15T00:00:00.000Z',
            first_seen_source: {
              kind: 'manual',
              source_id: 'owner/repo',
              source_url: 'https://github.com/owner/repo',
              observed_at: '2026-01-15T00:00:00.000Z',
            },
            sources: [
              {
                kind: 'manual',
                source_id: 'owner/repo',
                source_url: 'https://github.com/owner/repo',
                observed_at: '2026-01-15T00:00:00.000Z',
              },
            ],
            status: 'candidate',
          },
        ],
      },
      null,
      2,
    ) + '\n';

  const meta =
    JSON.stringify(
      {
        schema_version: 1,
        generated_at: '2026-01-15T00:00:00.000Z',
        dataset_sha: sha256Hex(candidates),
        candidate_count: 1,
        source_count: 1,
        generator_version: '0.1.0',
      },
      null,
      2,
    ) + '\n';

  return { candidates, meta };
}

function dirs(): { dataDir: string; distDir: string } {
  return {
    dataDir: mkdtempSync(join(tmpdir(), 'discovery-stage-data-')),
    distDir: mkdtempSync(join(tmpdir(), 'discovery-stage-dist-')),
  };
}

describe('Discovery artifact staging (fail-soft publication)', () => {
  it('stages a valid discovery artifact pair into the dist', () => {
    const { dataDir, distDir } = dirs();
    const pair = validArtifactPair();
    writeFileSync(join(dataDir, DISCOVERY_CANDIDATES_FILE), pair.candidates);
    writeFileSync(join(dataDir, DISCOVERY_CANDIDATES_META_FILE), pair.meta);
    const result = stageDiscoveryArtifacts({ dataDir, distDir });
    expect(result.staged).toBe(true);
    expect(existsSync(join(distDir, DISCOVERY_CANDIDATES_FILE))).toBe(true);
    expect(existsSync(join(distDir, DISCOVERY_CANDIDATES_META_FILE))).toBe(true);
  });

  it('is fail-soft when discovery artifacts are absent', () => {
    const { dataDir, distDir } = dirs();
    const result = stageDiscoveryArtifacts({ dataDir, distDir });
    expect(result.staged).toBe(false);
    expect(existsSync(join(distDir, DISCOVERY_CANDIDATES_FILE))).toBe(false);
  });

  it('is fail-soft when only one discovery artifact is present', () => {
    const { dataDir, distDir } = dirs();
    const pair = validArtifactPair();
    writeFileSync(join(dataDir, DISCOVERY_CANDIDATES_FILE), pair.candidates);
    const result = stageDiscoveryArtifacts({ dataDir, distDir });
    expect(result.staged).toBe(false);
    expect(result.reason).toMatch(/incomplete/);
  });

  it('is fail-soft on a hash mismatch', () => {
    const { dataDir, distDir } = dirs();
    const pair = validArtifactPair();
    writeFileSync(join(dataDir, DISCOVERY_CANDIDATES_FILE), pair.candidates);
    writeFileSync(
      join(dataDir, DISCOVERY_CANDIDATES_META_FILE),
      pair.meta.replace(/[0-9a-f]{64}/, '0'.repeat(64)),
    );
    const result = stageDiscoveryArtifacts({ dataDir, distDir });
    expect(result.staged).toBe(false);
    expect(existsSync(join(distDir, DISCOVERY_CANDIDATES_FILE))).toBe(false);
  });

  it('is fail-soft on a count mismatch', () => {
    const { dataDir, distDir } = dirs();
    const pair = validArtifactPair();
    writeFileSync(join(dataDir, DISCOVERY_CANDIDATES_FILE), pair.candidates);
    writeFileSync(
      join(dataDir, DISCOVERY_CANDIDATES_META_FILE),
      pair.meta.replace('"candidate_count": 1', '"candidate_count": 2'),
    );
    const result = stageDiscoveryArtifacts({ dataDir, distDir });
    expect(result.staged).toBe(false);
    expect(existsSync(join(distDir, DISCOVERY_CANDIDATES_FILE))).toBe(false);
  });
});
