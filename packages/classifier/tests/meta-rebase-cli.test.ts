import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  AiAnnotationsMetaSchema,
  buildAiAnnotationsMeta,
  serializeAiAnnotationsMeta,
  serializeAnnotations,
} from '@starred/ai-schema';
import type { Annotation } from '@starred/ai-schema';
import type { CanonicalRepo } from '@starred/schema';
import { describe, expect, it } from 'vitest';
import { runMetaRebaseCommand } from '../src/meta-rebase-cli';
import {
  aiConfig,
  expectedFingerprint,
  FakeReadmeSource,
  makeAnnotationFor,
  makeDataset,
  readmeEntries,
  repo,
} from './helpers';

const CONFIG = aiConfig();
const REF = { path: 'README.md', oid: 'oid-1' };
const HEAD_TS = '2026-07-01T00:00:00Z';
const STALE_SHA = 'e'.repeat(64);

function sourceFor(repos: CanonicalRepo[], ref = REF): FakeReadmeSource {
  return new FakeReadmeSource(
    readmeEntries(Object.fromEntries(repos.map((r) => [`${r.owner}/${r.name}`, { ref }]))),
  );
}

function headMetaBytes(annotationsBytes: string, datasetSha256: string): string {
  return serializeAiAnnotationsMeta(
    buildAiAnnotationsMeta({
      annotationsBytes,
      annotationCount: JSON.parse(annotationsBytes).annotations.length,
      datasetSha256,
      generatedAt: HEAD_TS,
    }),
  );
}

/** Write current base + head fixtures to a temp dir; return the paths. */
function fixture(
  repos: CanonicalRepo[],
  headAnnotations: Annotation[],
  baseAnnotations?: Annotation[],
) {
  const dir = mkdtempSync(join(tmpdir(), 'meta-rebase-cli-'));
  const { starsText, metaText } = makeDataset(repos);
  const starsPath = join(dir, 'stars.json');
  const metaPath = join(dir, 'dataset-meta.json');
  const headAnnotationsPath = join(dir, 'head-ai-annotations.json');
  const headMetaPath = join(dir, 'head-ai-annotations-meta.json');
  const outDir = join(dir, 'out');
  writeFileSync(starsPath, starsText);
  writeFileSync(metaPath, metaText);
  const headBytes = serializeAnnotations(headAnnotations);
  writeFileSync(headAnnotationsPath, headBytes);
  writeFileSync(headMetaPath, headMetaBytes(headBytes, STALE_SHA));
  let baseAnnotationsPath: string | undefined;
  if (baseAnnotations) {
    baseAnnotationsPath = join(dir, 'base-ai-annotations.json');
    writeFileSync(baseAnnotationsPath, serializeAnnotations(baseAnnotations));
  }
  return {
    dir,
    starsPath,
    metaPath,
    headAnnotationsPath,
    headMetaPath,
    baseAnnotationsPath,
    outDir,
    headBytes,
  };
}

describe('runMetaRebaseCommand (ROAD-A manual CLI orchestration)', () => {
  it('writes the re-stamped pair: annotations byte-identical, only dataset_sha256 changed', async () => {
    const a = repo('a');
    const ann = makeAnnotationFor(a, expectedFingerprint(a, CONFIG, REF), REF);
    const fx = fixture([a], [ann]);
    const expectedSha = (JSON.parse(readFileSync(fx.metaPath, 'utf8')) as { stars_sha256: string })
      .stars_sha256;

    const res = await runMetaRebaseCommand({
      starsPath: fx.starsPath,
      datasetMetaPath: fx.metaPath,
      headAnnotationsPath: fx.headAnnotationsPath,
      headMetaPath: fx.headMetaPath,
      outDir: fx.outDir,
      dryRun: false,
      source: sourceFor([a]),
      config: CONFIG,
      maxChangedPerRun: 25,
    });

    expect(res.ok).toBe(true);
    expect(res.wrote).toBe(true);
    expect(readFileSync(res.annotationsPath!, 'utf8')).toBe(fx.headBytes); // byte-identical
    const meta = AiAnnotationsMetaSchema.parse(JSON.parse(readFileSync(res.metaPath!, 'utf8')));
    expect(meta.dataset_sha256).toBe(expectedSha); // re-stamped onto current base
    expect(meta.dataset_sha256).not.toBe(STALE_SHA);
    expect(meta.generated_at).toBe(HEAD_TS); // preserved
  });

  it('--dry-run verifies but writes nothing', async () => {
    const a = repo('a');
    const ann = makeAnnotationFor(a, expectedFingerprint(a, CONFIG, REF), REF);
    const fx = fixture([a], [ann]);
    const res = await runMetaRebaseCommand({
      starsPath: fx.starsPath,
      datasetMetaPath: fx.metaPath,
      headAnnotationsPath: fx.headAnnotationsPath,
      headMetaPath: fx.headMetaPath,
      outDir: fx.outDir,
      dryRun: true,
      source: sourceFor([a]),
      config: CONFIG,
      maxChangedPerRun: 25,
    });
    expect(res.ok).toBe(true);
    expect(res.wrote).toBe(false);
    expect(existsSync(fx.outDir)).toBe(false);
  });

  it('omitting --out-dir is report-only (no write)', async () => {
    const a = repo('a');
    const ann = makeAnnotationFor(a, expectedFingerprint(a, CONFIG, REF), REF);
    const fx = fixture([a], [ann]);
    const res = await runMetaRebaseCommand({
      starsPath: fx.starsPath,
      datasetMetaPath: fx.metaPath,
      headAnnotationsPath: fx.headAnnotationsPath,
      headMetaPath: fx.headMetaPath,
      dryRun: false,
      source: sourceFor([a]),
      config: CONFIG,
      maxChangedPerRun: 25,
    });
    expect(res.ok).toBe(true);
    expect(res.wrote).toBe(false);
  });

  it('refuses (no write) when a head annotation has a stale README OID', async () => {
    const a = repo('a');
    const staleRef = { path: 'README.md', oid: 'oid-old' };
    const ann = makeAnnotationFor(a, expectedFingerprint(a, CONFIG, staleRef), staleRef);
    const fx = fixture([a], [ann]);
    const res = await runMetaRebaseCommand({
      starsPath: fx.starsPath,
      datasetMetaPath: fx.metaPath,
      headAnnotationsPath: fx.headAnnotationsPath,
      headMetaPath: fx.headMetaPath,
      outDir: fx.outDir,
      dryRun: false,
      source: sourceFor([a], { path: 'README.md', oid: 'oid-new' }),
      config: CONFIG,
      maxChangedPerRun: 25,
    });
    expect(res.ok).toBe(false);
    expect(res.wrote).toBe(false);
    expect(existsSync(fx.outDir)).toBe(false);
    expect(res.violations.some((v) => v.reason.includes('README OID'))).toBe(true);
  });

  it('refuses when the delta exceeds the per-run budget (PROV-8)', async () => {
    const a = repo('a');
    const b = repo('b');
    const annA = makeAnnotationFor(a, expectedFingerprint(a, CONFIG, REF), REF);
    const annB = makeAnnotationFor(b, expectedFingerprint(b, CONFIG, REF), REF);
    const fx = fixture([a, b], [annA, annB]);
    const res = await runMetaRebaseCommand({
      starsPath: fx.starsPath,
      datasetMetaPath: fx.metaPath,
      headAnnotationsPath: fx.headAnnotationsPath,
      headMetaPath: fx.headMetaPath,
      outDir: fx.outDir,
      dryRun: false,
      source: sourceFor([a, b]),
      config: CONFIG,
      maxChangedPerRun: 1,
    });
    expect(res.ok).toBe(false);
    expect(res.wrote).toBe(false);
  });

  it('refuses a metadata-only re-stamp (head annotations equal the base)', async () => {
    const a = repo('a');
    const ann = makeAnnotationFor(a, expectedFingerprint(a, CONFIG, REF), REF);
    const fx = fixture([a], [ann], [ann]); // base already has ann → head == base
    const res = await runMetaRebaseCommand({
      starsPath: fx.starsPath,
      datasetMetaPath: fx.metaPath,
      baseAnnotationsPath: fx.baseAnnotationsPath,
      headAnnotationsPath: fx.headAnnotationsPath,
      headMetaPath: fx.headMetaPath,
      outDir: fx.outDir,
      dryRun: false,
      source: sourceFor([a]),
      config: CONFIG,
      maxChangedPerRun: 25,
    });
    expect(res.ok).toBe(false);
    expect(res.wrote).toBe(false);
    expect(res.violations.some((v) => v.reason.includes('metadata-only'))).toBe(true);
  });
});

describe('meta-rebase stays manual (not wired into CI)', () => {
  it('no workflow or script invokes the meta-rebase command', () => {
    const root = resolve(import.meta.dirname, '../../..');
    const scan: string[] = [];
    for (const rel of ['.github/workflows', 'scripts']) {
      const dir = join(root, rel);
      if (!existsSync(dir)) continue;
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (readFileSync(p, 'utf8').includes('meta-rebase')) scan.push(`${rel}/${f}`);
      }
    }
    expect(scan).toEqual([]);
  });
});
