import { AiAnnotationsMetaSchema, serializeAnnotations } from '@starred/ai-schema';
import type { CanonicalRepo } from '@starred/schema';
import { describe, expect, it } from 'vitest';
import { loadCanonicalDataset } from '../src/dataset';
import { rebaseAiAnnotationsMeta } from '../src/meta-rebase';
import { verifyAnnotationProvenance } from '../src/provenance';
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

function load(repos: CanonicalRepo[]) {
  const { starsText, metaText } = makeDataset(repos);
  return loadCanonicalDataset(starsText, metaText);
}

function sourceFor(repos: CanonicalRepo[], ref = REF): FakeReadmeSource {
  return new FakeReadmeSource(
    readmeEntries(Object.fromEntries(repos.map((r) => [`${r.owner}/${r.name}`, { ref }]))),
  );
}

describe('rebaseAiAnnotationsMeta (ROAD-A, model-free)', () => {
  it('re-stamps the meta to the current base when the head passes provenance', async () => {
    const a = repo('a');
    const dataset = load([a]);
    const ann = makeAnnotationFor(a, expectedFingerprint(a, CONFIG, REF), REF);
    const headAnnotationsBytes = serializeAnnotations([ann]);

    const result = await rebaseAiAnnotationsMeta({
      repos: dataset.repos,
      datasetSha256: dataset.datasetSha256,
      baseAnnotations: [],
      headAnnotationsBytes,
      headGeneratedAt: HEAD_TS,
      source: sourceFor([a]),
      config: CONFIG,
      maxChangedPerRun: 25,
    });

    expect(result.ok).toBe(true);
    expect(result.annotationsBytes).toBe(headAnnotationsBytes); // bytes preserved exactly
    const meta = AiAnnotationsMetaSchema.parse(JSON.parse(result.metaBytes!));
    expect(meta.dataset_sha256).toBe(dataset.datasetSha256); // re-stamped onto current base
    expect(meta.generated_at).toBe(HEAD_TS); // no timestamp churn
    expect(meta.annotation_count).toBe(1);
  });

  it('the re-stamped artifacts pass the real provenance gate (PROV-5 satisfied)', async () => {
    const a = repo('a');
    const dataset = load([a]);
    const ann = makeAnnotationFor(a, expectedFingerprint(a, CONFIG, REF), REF);
    const headAnnotationsBytes = serializeAnnotations([ann]);
    const result = await rebaseAiAnnotationsMeta({
      repos: dataset.repos,
      datasetSha256: dataset.datasetSha256,
      baseAnnotations: [],
      headAnnotationsBytes,
      headGeneratedAt: HEAD_TS,
      source: sourceFor([a]),
      config: CONFIG,
      maxChangedPerRun: 25,
    });
    const meta = AiAnnotationsMetaSchema.parse(JSON.parse(result.metaBytes!));
    const gate = await verifyAnnotationProvenance({
      repos: dataset.repos,
      datasetSha256: dataset.datasetSha256,
      baseAnnotations: [],
      headAnnotations: [ann],
      headMetaDatasetSha256: meta.dataset_sha256, // the re-stamped pointer
      source: sourceFor([a]),
      config: CONFIG,
      maxChangedPerRun: 25,
    });
    expect(gate.ok).toBe(true);
  });

  it('refuses to re-stamp when a head annotation has a stale README OID', async () => {
    const a = repo('a');
    const dataset = load([a]);
    const staleRef = { path: 'README.md', oid: 'oid-old' };
    const ann = makeAnnotationFor(a, expectedFingerprint(a, CONFIG, staleRef), staleRef);
    const result = await rebaseAiAnnotationsMeta({
      repos: dataset.repos,
      datasetSha256: dataset.datasetSha256,
      baseAnnotations: [],
      headAnnotationsBytes: serializeAnnotations([ann]),
      headGeneratedAt: HEAD_TS,
      source: sourceFor([a], { path: 'README.md', oid: 'oid-new' }),
      config: CONFIG,
      maxChangedPerRun: 25,
    });
    expect(result.ok).toBe(false);
    expect(result.metaBytes).toBeUndefined();
    expect(result.violations.some((v) => v.reason.includes('README OID'))).toBe(true);
  });

  it('refuses an invented node not in the canonical dataset', async () => {
    const a = repo('a');
    const dataset = load([a]);
    const ghost = makeAnnotationFor(repo('ghost'), 'f'.repeat(64), null);
    const result = await rebaseAiAnnotationsMeta({
      repos: dataset.repos,
      datasetSha256: dataset.datasetSha256,
      baseAnnotations: [],
      headAnnotationsBytes: serializeAnnotations([ghost]),
      headGeneratedAt: HEAD_TS,
      source: sourceFor([a]),
      config: CONFIG,
      maxChangedPerRun: 25,
    });
    expect(result.ok).toBe(false);
    expect(result.metaBytes).toBeUndefined();
  });

  it('rejects non-canonical ai-annotations.json bytes', async () => {
    const a = repo('a');
    const dataset = load([a]);
    const ann = makeAnnotationFor(a, expectedFingerprint(a, CONFIG, REF), REF);
    const canonical = serializeAnnotations([ann]);
    const nonCanonical = JSON.stringify(JSON.parse(canonical)); // compact, no indent/newline
    expect(nonCanonical).not.toBe(canonical);
    const result = await rebaseAiAnnotationsMeta({
      repos: dataset.repos,
      datasetSha256: dataset.datasetSha256,
      baseAnnotations: [],
      headAnnotationsBytes: nonCanonical,
      headGeneratedAt: HEAD_TS,
      source: sourceFor([a]),
      config: CONFIG,
      maxChangedPerRun: 25,
    });
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.reason.includes('canonical'))).toBe(true);
  });

  it('exceeding the per-run budget is rejected (PROV-8 preserved)', async () => {
    const a = repo('a');
    const b = repo('b');
    const dataset = load([a, b]);
    const annA = makeAnnotationFor(a, expectedFingerprint(a, CONFIG, REF), REF);
    const annB = makeAnnotationFor(b, expectedFingerprint(b, CONFIG, REF), REF);
    const result = await rebaseAiAnnotationsMeta({
      repos: dataset.repos,
      datasetSha256: dataset.datasetSha256,
      baseAnnotations: [],
      headAnnotationsBytes: serializeAnnotations([annA, annB]),
      headGeneratedAt: HEAD_TS,
      source: sourceFor([a, b]),
      config: CONFIG,
      maxChangedPerRun: 1,
    });
    expect(result.ok).toBe(false);
  });
});
