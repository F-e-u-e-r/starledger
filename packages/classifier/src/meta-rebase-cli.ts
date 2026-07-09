import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Annotation, AiAnnotationsSchema } from '@starred/ai-schema';
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
  /** Current base ai-annotations.json path (prior trusted state). */
  baseAnnotationsPath?: string;
  /**
   * Explicit acknowledgment that the current base has NO annotations yet (the
   * first AI PR). Required when `baseAnnotationsPath` is omitted — otherwise a
   * forgotten base path would silently verify against an empty base and disagree
   * with the live gate (counting every existing annotation as changed, missing
   * the metadata-only refusal).
   */
  coldStart?: boolean;
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
  // A SUPPLIED but missing base path is an operator typo — fail closed rather
  // than silently comparing against an empty base (which would defeat the
  // metadata-only refusal). Only an OMITTED path means "no prior state".
  let baseAnnotations: readonly Annotation[] = [];
  if (opts.baseAnnotationsPath !== undefined) {
    if (!existsSync(opts.baseAnnotationsPath)) {
      throw new Error(`base annotations file not found: ${opts.baseAnnotationsPath}`);
    }
    baseAnnotations = AiAnnotationsSchema.parse(
      JSON.parse(readFileSync(opts.baseAnnotationsPath, 'utf8')),
    ).annotations;
  } else if (opts.coldStart !== true) {
    throw new Error(
      'specify --base-annotations <path> (the current base ai-annotations.json), ' +
        'or --cold-start if the base has no annotations yet',
    );
  }

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
  // Files that already existed (e.g. under `--out-dir .`) must NOT be deleted by
  // cleanup — only remove what THIS run newly created, so a failed write never
  // clobbers the operator's previous pair.
  const preExisting = new Set([annotationsPath, metaPath].filter((p) => existsSync(p)));
  try {
    writeFileSync(annotationsPath, result.annotationsBytes ?? '', 'utf8');
    writeFileSync(metaPath, result.metaBytes ?? '', 'utf8');
  } catch (err) {
    for (const p of [annotationsPath, metaPath]) {
      if (!preExisting.has(p) && existsSync(p)) {
        try {
          rmSync(p);
        } catch {
          /* best-effort cleanup */
        }
      }
    }
    throw err;
  }
  return { ok: true, violations: [], wrote: true, annotationsPath, metaPath };
}
