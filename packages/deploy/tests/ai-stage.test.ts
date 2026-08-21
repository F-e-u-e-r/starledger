import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildAiAnnotationsMeta,
  serializeAiAnnotationsMeta,
  serializeAnnotations,
} from '@starred/ai-schema';
import { describe, expect, it } from 'vitest';
import { AI_ANNOTATIONS_FILE, AI_ANNOTATIONS_META_FILE, stageAiArtifacts } from '../src/stage';

function validArtifactPair(): { annotations: string; meta: string } {
  const annotations = serializeAnnotations([]);
  const meta = serializeAiAnnotationsMeta(
    buildAiAnnotationsMeta({
      annotationsBytes: annotations,
      annotationCount: 0,
      datasetSha256: 'd'.repeat(64),
      generatedAt: '2026-06-21T00:00:00Z',
    }),
  );
  return { annotations, meta };
}

function dirs(): { dataDir: string; distDir: string } {
  return {
    dataDir: mkdtempSync(join(tmpdir(), 'ai-stage-data-')),
    distDir: mkdtempSync(join(tmpdir(), 'ai-stage-dist-')),
  };
}

describe('AI artifact staging (fail-soft publication)', () => {
  it('PUB-7: stages a valid AI artifact pair into the dist', () => {
    const { dataDir, distDir } = dirs();
    const pair = validArtifactPair();
    writeFileSync(join(dataDir, AI_ANNOTATIONS_FILE), pair.annotations);
    writeFileSync(join(dataDir, AI_ANNOTATIONS_META_FILE), pair.meta);
    const result = stageAiArtifacts({ dataDir, distDir });
    expect(result.staged).toBe(true);
    expect(existsSync(join(distDir, AI_ANNOTATIONS_FILE))).toBe(true);
    expect(existsSync(join(distDir, AI_ANNOTATIONS_META_FILE))).toBe(true);
  });

  it('is fail-soft when AI artifacts are absent (canonical deploy proceeds)', () => {
    const { dataDir, distDir } = dirs();
    const result = stageAiArtifacts({ dataDir, distDir });
    expect(result.staged).toBe(false);
    expect(existsSync(join(distDir, AI_ANNOTATIONS_FILE))).toBe(false);
  });

  it('is fail-soft (skips, never throws) on a hash mismatch', () => {
    const { dataDir, distDir } = dirs();
    const pair = validArtifactPair();
    writeFileSync(join(dataDir, AI_ANNOTATIONS_FILE), pair.annotations);
    writeFileSync(
      join(dataDir, AI_ANNOTATIONS_META_FILE),
      pair.meta.replace(/[0-9a-f]{64}/, '0'.repeat(64)),
    );
    const result = stageAiArtifacts({ dataDir, distDir });
    expect(result.staged).toBe(false);
    expect(existsSync(join(distDir, AI_ANNOTATIONS_FILE))).toBe(false);
  });

  it('is fail-soft when a hash-matching artifact fails the strict AI schemas', () => {
    const { dataDir, distDir } = dirs();
    writeFileSync(join(dataDir, AI_ANNOTATIONS_FILE), '{"schema_version":"1.0"}\n');
    writeFileSync(
      join(dataDir, AI_ANNOTATIONS_META_FILE),
      JSON.stringify({
        annotations_sha256: '4fde2c62eaeb82fe10581324384d0af72f965f0cc1d8375b234453bbd24c1857',
      }),
    );
    const result = stageAiArtifacts({ dataDir, distDir });
    expect(result.staged).toBe(false);
    expect(existsSync(join(distDir, AI_ANNOTATIONS_FILE))).toBe(false);
  });
});

/**
 * BUILD/RUNTIME BYTE AGREEMENT (owner ruling, round-5 class closure).
 *
 * Same contract as the discovery pair: the runtime loader verifies the exact
 * received bytes, so the build must too. The trap is deliberately NOT a BOM —
 * a literal U+FFFD's three UTF-8 bytes become a bare 0xFF, which decodes back
 * to U+FFFD. That kills the whole `hash(decode(bytes))` mutant rather than one
 * prefix special case.
 */
describe('AI build-side integrity is a BYTE contract', () => {
  function pairWithReplacementChar(): { annotationsBytes: Buffer; meta: string } {
    const annotationsText = serializeAnnotations([
      {
        node_id: 'R_1',
        category: 'developer-tools',
        tags: ['automation', 'cli'],
        summary:
          'A concise, factual description \uFFFD of what this repository does, who it is for, and why it is useful to developers.',
        source: {
          kind: 'metadata',
          readme_path: null,
          readme_oid: null,
          repo_metadata_sha256: 'b'.repeat(64),
          fingerprint: 'c'.repeat(64),
        },
        generation: {
          executor_kind: 'claude-routine',
          execution_profile_version: 'agent-v1',
          model_label: 'informational-only',
          prompt_version: 'classify-v1',
          generated_at: '2026-06-20T00:00:00Z',
        },
      },
    ]);
    const annotationsBytes = Buffer.from(annotationsText, 'utf8');
    const meta = serializeAiAnnotationsMeta(
      buildAiAnnotationsMeta({
        annotationsBytes: annotationsText,
        annotationCount: 1,
        datasetSha256: 'd'.repeat(64),
        generatedAt: '2026-06-21T00:00:00Z',
      }),
    );
    return { annotationsBytes, meta };
  }

  it('CONTROL: the unmutated bytes stage', () => {
    const { dataDir, distDir } = dirs();
    const { annotationsBytes, meta } = pairWithReplacementChar();
    writeFileSync(join(dataDir, AI_ANNOTATIONS_FILE), annotationsBytes);
    writeFileSync(join(dataDir, AI_ANNOTATIONS_META_FILE), meta);
    expect(stageAiArtifacts({ dataDir, distDir }).staged).toBe(true);
  });

  it('skips a byte mutation that decodes to identical text', () => {
    const { dataDir, distDir } = dirs();
    const { annotationsBytes, meta } = pairWithReplacementChar();
    const at = annotationsBytes.indexOf(Buffer.from([0xef, 0xbf, 0xbd]));
    expect(at).toBeGreaterThan(-1);
    const mutated = Buffer.concat([
      annotationsBytes.subarray(0, at),
      Buffer.from([0xff]),
      annotationsBytes.subarray(at + 3),
    ]);
    expect(mutated.equals(annotationsBytes)).toBe(false);
    expect(mutated.toString('utf8')).toBe(annotationsBytes.toString('utf8'));

    writeFileSync(join(dataDir, AI_ANNOTATIONS_FILE), mutated);
    writeFileSync(join(dataDir, AI_ANNOTATIONS_META_FILE), meta);
    const result = stageAiArtifacts({ dataDir, distDir });
    expect(result.staged).toBe(false);
    expect(result.reason).toContain('hash mismatch');
    expect(existsSync(join(distDir, AI_ANNOTATIONS_FILE))).toBe(false);
  });
});

describe('stageAiArtifacts — source probing (round 10)', () => {
  it('INCOMPLETE: a half pair is named incomplete, not "no artifacts present"', () => {
    const { dataDir, distDir } = dirs();
    writeFileSync(join(dataDir, AI_ANNOTATIONS_FILE), validArtifactPair().annotations);
    const result = stageAiArtifacts({ dataDir, distDir });
    expect(result.staged).toBe(false);
    expect(result.reason).toContain('incomplete AI artifact pair');
  });

  it('PROBE-ENOENT-ONLY: a non-ENOENT probe error is surfaced, never read as absence', () => {
    const { dataDir, distDir } = dirs();
    const pair = validArtifactPair();
    writeFileSync(join(dataDir, AI_ANNOTATIONS_FILE), pair.annotations);
    writeFileSync(join(dataDir, AI_ANNOTATIONS_META_FILE), pair.meta);
    const eio = Object.assign(new Error('EIO: i/o error'), { code: 'EIO' });
    const result = stageAiArtifacts(
      { dataDir, distDir },
      {
        lstatImpl: (() => {
          throw eio;
        }) as never,
      },
    );
    expect(result.staged).toBe(false);
    expect(result.reason).toContain('could not probe its sources');
    expect(result.reason).toContain('EIO');
  });
});

describe('stageAiArtifacts — the post-publish guard fires', () => {
  it('GUARD: corrupted published bytes are refused, not reported as staged', () => {
    const { dataDir, distDir } = dirs();
    const pair = validArtifactPair();
    const artifact = pair.annotations;
    const meta = pair.meta;
    writeFileSync(join(dataDir, AI_ANNOTATIONS_FILE), artifact);
    writeFileSync(join(dataDir, AI_ANNOTATIONS_FILE.replace('.json', '-meta.json')), meta);
    const result = stageAiArtifacts(
      { dataDir, distDir },
      { afterPublish: () => writeFileSync(join(distDir, AI_ANNOTATIONS_FILE), 'CORRUPTED') },
    );
    expect(result.staged).toBe(false);
    expect(result.reason).toContain('AI artifact published bytes');
    // CONSEQUENCE (round-10 finding, all three legs): merely reporting the
    // mismatch left the pair in the dist, the CLI logged "skipped" and exited
    // 0, verification checks only the canonical pair — so Pages UPLOADED the
    // retained pair. Detection must discard this run's writes: the layer then
    // fails soft to absent instead of serving unvalidated bytes.
    expect(result.reason).toContain('writes were removed');
    expect(existsSync(join(distDir, AI_ANNOTATIONS_FILE))).toBe(false);
    expect(existsSync(join(distDir, AI_ANNOTATIONS_META_FILE))).toBe(false);
  });

  it('RESIDUE: a write failure between the two halves names the partial pair it left behind', () => {
    // Round-9 finding (sol@max): with the destination meta path blocked, the
    // artifact write has already landed when the meta write throws — the
    // generic catch reported only the errno while a partial pair sat in the
    // dist, and the deploy uploads it. The reason must name the residue.
    const { dataDir, distDir } = dirs();
    const pair = validArtifactPair();
    writeFileSync(join(dataDir, AI_ANNOTATIONS_FILE), pair.annotations);
    writeFileSync(join(dataDir, AI_ANNOTATIONS_META_FILE), pair.meta);
    mkdirSync(join(distDir, AI_ANNOTATIONS_META_FILE)); // meta write will throw EISDIR
    const result = stageAiArtifacts({ dataDir, distDir });
    expect(result.staged).toBe(false);
    // The landed artifact half is discarded; the blocking DIRECTORY at the
    // meta path cannot be removed by a non-recursive force-rm, and the reason
    // says so instead of claiming a clean discard.
    expect(result.reason).toContain('could NOT all be removed');
    expect(existsSync(join(distDir, AI_ANNOTATIONS_FILE))).toBe(false);
  });

  it('GUARD-META: a meta rewritten after publish is refused even though the pair stays coherent', () => {
    const { dataDir, distDir } = dirs();
    const pair = validArtifactPair();
    writeFileSync(join(dataDir, AI_ANNOTATIONS_FILE), pair.annotations);
    writeFileSync(join(dataDir, AI_ANNOTATIONS_META_FILE), pair.meta);
    // The round-8 reproduction: ONLY generated_at changes, so the published
    // pair remains internally coherent — annotations_sha256 still matches the
    // artifact — and NO later validation (runtime included) can reject it.
    // Only a read-back against THIS invocation's validated snapshot can.
    const rewritten = pair.meta.replace('2026-06-21T00:00:00Z', '2027-01-01T00:00:00Z');
    expect(rewritten).not.toBe(pair.meta);
    const result = stageAiArtifacts(
      { dataDir, distDir },
      { afterPublish: () => writeFileSync(join(distDir, AI_ANNOTATIONS_META_FILE), rewritten) },
    );
    expect(result.staged).toBe(false);
    expect(result.reason).toContain('AI meta published bytes');
    // CONSEQUENCE (round-10, all three legs): a coherent meta rewrite is the
    // one corruption the runtime CANNOT refuse, so leaving it in the dist
    // meant Pages uploaded it and loadAnnotations served the rewritten
    // timestamp. The pair must be discarded — absence fails soft.
    expect(result.reason).toContain('writes were removed');
    expect(existsSync(join(distDir, AI_ANNOTATIONS_META_FILE))).toBe(false);
    expect(existsSync(join(distDir, AI_ANNOTATIONS_FILE))).toBe(false);
  });
});
