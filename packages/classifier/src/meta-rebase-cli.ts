import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AiAnnotationsSchema } from '@starred/ai-schema';
import { loadCanonicalDataset } from './dataset';
import { rebaseAiAnnotationsMeta } from './meta-rebase';
import type { PlannerConfig } from './planner';
import type { ProvenanceViolation } from './provenance';
import type { ReadmeSource } from './readme-source';

export interface MetaRebaseCommandOptions {
  /** Current base canonical stars.json path. */
  starsPath: string;
  /** Current base dataset-meta.json path. */
  datasetMetaPath: string;
  /** Current base ai-annotations.json path (prior trusted state); optional. */
  baseAnnotationsPath?: string;
  /** In-flight head ai-annotations.json path. */
  headAnnotationsPath: string;
  /** In-flight head ai-annotations-meta.json path. */
  headMetaPath: string;
  /** Directory to write the re-stamped pair; write happens only when set AND not dryRun. */
  outDir?: string;
  /** Verify + report only, never write. */
  dryRun: boolean;
  /** Live README discovery (OctokitReadmeSource in the CLI; a fake in tests). */
  source: ReadmeSource;
  config: PlannerConfig;
  maxChangedPerRun: number;
}

export interface MetaRebaseCommandResult {
  ok: boolean;
  violations: ProvenanceViolation[];
  /** Whether the re-stamped pair was written to disk. */
  wrote: boolean;
  annotationsPath?: string;
  metaPath?: string;
}

/**
 * Orchestration for the manual `classifier meta-rebase` command (ROAD-A). Reads
 * the current base + in-flight head artifacts, delegates to
 * {@link rebaseAiAnnotationsMeta} (which does ALL the validation/provenance and
 * changes only `dataset_sha256`), and writes the re-stamped pair — or nothing
 * under `--dry-run` / when no output directory is given. On refusal it writes
 * NOTHING (no partial output) and returns the violations. The README `source` is
 * injected so this is unit-testable offline; the live CLI wires an
 * `OctokitReadmeSource`. NOT invoked by any workflow or CI. See
 * docs/adr/ADR-002-meta-rebase.md.
 */
export async function runMetaRebaseCommand(
  opts: MetaRebaseCommandOptions,
): Promise<MetaRebaseCommandResult> {
  const dataset = loadCanonicalDataset(
    readFileSync(opts.starsPath, 'utf8'),
    readFileSync(opts.datasetMetaPath, 'utf8'),
  );
  const headAnnotationsBytes = readFileSync(opts.headAnnotationsPath, 'utf8');
  const headMetaBytes = readFileSync(opts.headMetaPath, 'utf8');
  const baseAnnotations =
    opts.baseAnnotationsPath !== undefined && existsSync(opts.baseAnnotationsPath)
      ? AiAnnotationsSchema.parse(JSON.parse(readFileSync(opts.baseAnnotationsPath, 'utf8')))
          .annotations
      : [];

  const result = await rebaseAiAnnotationsMeta({
    repos: dataset.repos,
    datasetSha256: dataset.datasetSha256,
    baseAnnotations,
    headAnnotationsBytes,
    headMetaBytes,
    source: opts.source,
    config: opts.config,
    maxChangedPerRun: opts.maxChangedPerRun,
  });

  if (!result.ok) return { ok: false, violations: result.violations, wrote: false };

  if (opts.dryRun || opts.outDir === undefined) {
    return { ok: true, violations: [], wrote: false };
  }

  mkdirSync(opts.outDir, { recursive: true });
  const annotationsPath = join(opts.outDir, 'ai-annotations.json');
  const metaPath = join(opts.outDir, 'ai-annotations-meta.json');
  writeFileSync(annotationsPath, result.annotationsBytes ?? '', 'utf8');
  writeFileSync(metaPath, result.metaBytes ?? '', 'utf8');
  return { ok: true, violations: [], wrote: true, annotationsPath, metaPath };
}
