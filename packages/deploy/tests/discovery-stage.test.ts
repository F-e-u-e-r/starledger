import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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

/**
 * BUILD/RUNTIME BYTE AGREEMENT (owner ruling, round-5 class closure).
 *
 * The runtime loader verifies the exact received bytes. If the build hashed
 * DECODED text instead, an artifact whose bytes differ but decode identically
 * would pass staging and then be rejected at runtime — the layer going
 * unavailable after a deploy the build called sound.
 *
 * The trap is deliberately NOT a BOM: a literal U+FFFD's three UTF-8 bytes are
 * replaced by a bare 0xFF, which a decoder maps straight back to U+FFFD. This
 * kills the whole `hash(decode(bytes))` mutant, not just one prefix special
 * case — a "string hash plus a BOM check" fix still fails here.
 */
describe('discovery build-side integrity is a BYTE contract', () => {
  function pairWithReplacementChar(): { candidatesBytes: Buffer; meta: string } {
    const pair = validArtifactPair();
    const doc = JSON.parse(pair.candidates) as {
      candidates: { description: string }[];
    };
    doc.candidates[0]!.description = 'A test repo \uFFFD here';
    const candidatesText = JSON.stringify(doc, null, 2) + '\n';
    const candidatesBytes = Buffer.from(candidatesText, 'utf8');
    const metaDoc = JSON.parse(pair.meta) as Record<string, unknown>;
    metaDoc.dataset_sha = createHash('sha256').update(candidatesBytes).digest('hex');
    return { candidatesBytes, meta: JSON.stringify(metaDoc, null, 2) + '\n' };
  }

  it('CONTROL: the unmutated bytes stage', () => {
    const { dataDir, distDir } = dirs();
    const { candidatesBytes, meta } = pairWithReplacementChar();
    writeFileSync(join(dataDir, DISCOVERY_CANDIDATES_FILE), candidatesBytes);
    writeFileSync(join(dataDir, DISCOVERY_CANDIDATES_META_FILE), meta);
    expect(stageDiscoveryArtifacts({ dataDir, distDir }).staged).toBe(true);
  });

  it('skips a byte mutation that decodes to identical text', () => {
    const { dataDir, distDir } = dirs();
    const { candidatesBytes, meta } = pairWithReplacementChar();
    const at = candidatesBytes.indexOf(Buffer.from([0xef, 0xbf, 0xbd]));
    expect(at).toBeGreaterThan(-1);
    const mutated = Buffer.concat([
      candidatesBytes.subarray(0, at),
      Buffer.from([0xff]),
      candidatesBytes.subarray(at + 3),
    ]);
    // Preconditions of the trap: bytes differ, decoded text does not.
    expect(mutated.equals(candidatesBytes)).toBe(false);
    expect(mutated.toString('utf8')).toBe(candidatesBytes.toString('utf8'));

    writeFileSync(join(dataDir, DISCOVERY_CANDIDATES_FILE), mutated);
    writeFileSync(join(dataDir, DISCOVERY_CANDIDATES_META_FILE), meta);
    const result = stageDiscoveryArtifacts({ dataDir, distDir });
    expect(result.staged).toBe(false);
    expect(result.reason).toContain('hash mismatch');
    expect(existsSync(join(distDir, DISCOVERY_CANDIDATES_FILE))).toBe(false);
  });
});

describe('stageDiscoveryArtifacts — the post-publish guard fires', () => {
  it('GUARD: corrupted published bytes are refused, not reported as staged', () => {
    const { dataDir, distDir } = dirs();
    const pair = validArtifactPair();
    const artifact = pair.candidates;
    const meta = pair.meta;
    writeFileSync(join(dataDir, DISCOVERY_CANDIDATES_FILE), artifact);
    writeFileSync(join(dataDir, DISCOVERY_CANDIDATES_FILE.replace('.json', '-meta.json')), meta);
    const result = stageDiscoveryArtifacts(
      { dataDir, distDir },
      { afterPublish: () => writeFileSync(join(distDir, DISCOVERY_CANDIDATES_FILE), 'CORRUPTED') },
    );
    expect(result.staged).toBe(false);
    expect(result.reason).toContain('discovery artifact published bytes');
    // Truthful disk state, SAME contract as the meta half below (round-9
    // finding, both luna legs independently): the corrupt artifact REMAINS in
    // the dist and the reason must say so.
    expect(result.reason).toContain('dist retains');
    expect(readFileSync(join(distDir, DISCOVERY_CANDIDATES_FILE), 'utf8')).toBe('CORRUPTED');
  });

  it('RESIDUE: a write failure between the two halves names the partial pair it left behind', () => {
    // Round-9 finding (sol@max) — same contract as the AI pair.
    const { dataDir, distDir } = dirs();
    const pair = validArtifactPair();
    writeFileSync(join(dataDir, DISCOVERY_CANDIDATES_FILE), pair.candidates);
    writeFileSync(join(dataDir, DISCOVERY_CANDIDATES_META_FILE), pair.meta);
    mkdirSync(join(distDir, DISCOVERY_CANDIDATES_META_FILE)); // meta write will throw EISDIR
    const result = stageDiscoveryArtifacts({ dataDir, distDir });
    expect(result.staged).toBe(false);
    expect(result.reason).toContain('dist retains a partial pair');
    expect(existsSync(join(distDir, DISCOVERY_CANDIDATES_FILE))).toBe(true);
  });

  it('GUARD-META: a meta rewritten after publish is refused even though the pair stays coherent', () => {
    const { dataDir, distDir } = dirs();
    const pair = validArtifactPair();
    writeFileSync(join(dataDir, DISCOVERY_CANDIDATES_FILE), pair.candidates);
    writeFileSync(join(dataDir, DISCOVERY_CANDIDATES_META_FILE), pair.meta);
    // The round-8 reproduction: ONLY generated_at changes, so the published
    // pair remains internally coherent — dataset_sha still matches the
    // artifact — and NO later validation (runtime included) can reject it.
    // Only a read-back against THIS invocation's validated snapshot can.
    const rewritten = pair.meta.replace('2026-01-15T00:00:00.000Z', '2027-01-01T00:00:00.000Z');
    expect(rewritten).not.toBe(pair.meta);
    const result = stageDiscoveryArtifacts(
      { dataDir, distDir },
      {
        afterPublish: () => writeFileSync(join(distDir, DISCOVERY_CANDIDATES_META_FILE), rewritten),
      },
    );
    expect(result.staged).toBe(false);
    expect(result.reason).toContain('discovery meta published bytes');
    // Truthful disk state: optional-pair publication is non-transactional
    // (owner-accepted residual), so the mismatched meta REMAINS in the dist —
    // and the reason must say so rather than imply a removal that never ran.
    expect(result.reason).toContain('dist retains');
    expect(readFileSync(join(distDir, DISCOVERY_CANDIDATES_META_FILE), 'utf8')).toBe(rewritten);
  });
});
