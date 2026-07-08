import {
  type Annotation,
  AiAnnotationsSchema,
  buildAiAnnotationsMeta,
  serializeAiAnnotationsMeta,
  serializeAnnotations,
} from '@starred/ai-schema';
import type { CanonicalRepo } from '@starred/schema';
import type { PlannerConfig } from './planner';
import type { ReadmeSource } from './readme-source';
import { type ProvenanceViolation, verifyAnnotationProvenance } from './provenance';

export interface MetaRebaseInput {
  /** Trusted canonical repositories at the CURRENT base branch. */
  repos: readonly CanonicalRepo[];
  /** SHA-256 of the CURRENT canonical stars.json bytes — the base to re-stamp onto. */
  datasetSha256: string;
  /** Annotations at the current base (trusted prior state); empty if none. */
  baseAnnotations: readonly Annotation[];
  /** EXACT ai-annotations.json bytes proposed by the in-flight head PR. */
  headAnnotationsBytes: string;
  /** The head meta's `generated_at`, PRESERVED unchanged (no timestamp churn). */
  headGeneratedAt: string;
  /** Live README discovery — the SAME seam the planner / provenance gate uses. */
  source: ReadmeSource;
  config: PlannerConfig;
  /** Per-run budget: max added+modified annotations allowed in one PR. */
  maxChangedPerRun: number;
}

export interface MetaRebaseResult {
  ok: boolean;
  violations: ProvenanceViolation[];
  /** Present only when ok: the byte-identical ai-annotations.json bytes. */
  annotationsBytes?: string;
  /** Present only when ok: the re-stamped ai-annotations-meta.json bytes. */
  metaBytes?: string;
}

/**
 * Meta-rebase (ROAD-A), model-free. Re-stamp an in-flight AI PR's
 * `ai-annotations-meta.json.dataset_sha256` onto the CURRENT base so the daily
 * sync tick stops invalidating it via PROV-5 — WITHOUT calling a model.
 *
 * It re-runs the EXACT provenance gate against the current base with the meta
 * assumed already re-stamped (`headMetaDatasetSha256 := datasetSha256`), so a
 * re-stamp is produced ONLY when the annotations would independently pass every
 * per-annotation check plus PROV-5 against the new base. This PRESERVES PROV-5's
 * coverage (the verified base still equals the pointed-to base); it does not
 * relax it. The live `verify-ai-provenance` gate stays the final authority.
 *
 * The annotation bytes are preserved exactly and the meta `generated_at` is
 * preserved; only `dataset_sha256` (and the derived `annotations_sha256` over the
 * unchanged bytes) move to the current base.
 *
 * SECURITY: NOT wired into any workflow, required check, ruleset bypass, or
 * auto-merge — a manual/executor helper only. See docs/adr/ADR-002-meta-rebase.md.
 */
export async function rebaseAiAnnotationsMeta(input: MetaRebaseInput): Promise<MetaRebaseResult> {
  let annotations: Annotation[];
  try {
    annotations = AiAnnotationsSchema.parse(JSON.parse(input.headAnnotationsBytes)).annotations;
  } catch (err) {
    return {
      ok: false,
      violations: [
        {
          node_id: '',
          reason: `ai-annotations.json is not valid: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
    };
  }

  // The re-stamped meta's annotations_sha256 is computed over these exact bytes,
  // so a non-canonical body would disagree with the assembler and the live gate.
  if (serializeAnnotations(annotations) !== input.headAnnotationsBytes) {
    return {
      ok: false,
      violations: [
        { node_id: '', reason: 'ai-annotations.json is not in canonical serialized form' },
      ],
    };
  }

  const provenance = await verifyAnnotationProvenance({
    repos: input.repos,
    datasetSha256: input.datasetSha256,
    baseAnnotations: input.baseAnnotations,
    headAnnotations: annotations,
    // Assume the meta is already re-stamped: this is the ONLY difference from a
    // fresh classification, and it is safe precisely because every other check
    // below must still pass against the current base.
    headMetaDatasetSha256: input.datasetSha256,
    source: input.source,
    config: input.config,
    maxChangedPerRun: input.maxChangedPerRun,
  });
  if (!provenance.ok) return { ok: false, violations: provenance.violations };

  const meta = buildAiAnnotationsMeta({
    annotationsBytes: input.headAnnotationsBytes,
    annotationCount: annotations.length,
    datasetSha256: input.datasetSha256,
    generatedAt: input.headGeneratedAt,
  });
  return {
    ok: true,
    violations: [],
    annotationsBytes: input.headAnnotationsBytes,
    metaBytes: serializeAiAnnotationsMeta(meta),
  };
}
