import { z } from 'zod';
import { AI_SCHEMA_VERSION, sha256 } from './artifact';
import { TAXONOMY_VERSION } from './taxonomy';

const HEX64 = /^[0-9a-f]{64}$/;

/**
 * The fingerprint committed ALONGSIDE `ai-annotations.json`, rewritten ONLY when
 * the annotations change. `annotations_sha256` is the SHA-256 of the exact
 * `ai-annotations.json` bytes (so the dashboard can integrity-check the artifact
 * it loads); `dataset_sha256` records which canonical `stars.json` the
 * annotations were computed against.
 */
export const AiAnnotationsMetaSchema = z
  .object({
    schema_version: z.literal(AI_SCHEMA_VERSION),
    annotations_sha256: z.string().regex(HEX64, 'must be a lowercase hex sha256'),
    annotation_count: z.number().int().nonnegative(),
    taxonomy_version: z.literal(TAXONOMY_VERSION),
    dataset_sha256: z.string().regex(HEX64, 'must be a lowercase hex sha256'),
    generated_at: z.string(),
  })
  .strict();
export type AiAnnotationsMeta = z.infer<typeof AiAnnotationsMetaSchema>;

export interface BuildAiAnnotationsMetaInput {
  /** The EXACT serialized `ai-annotations.json` bytes (from `serializeAnnotations`). */
  annotationsBytes: string;
  annotationCount: number;
  /** SHA-256 of the canonical `stars.json` the annotations were computed against. */
  datasetSha256: string;
  generatedAt: string;
}

export function buildAiAnnotationsMeta(input: BuildAiAnnotationsMetaInput): AiAnnotationsMeta {
  return AiAnnotationsMetaSchema.parse({
    schema_version: AI_SCHEMA_VERSION,
    annotations_sha256: sha256(input.annotationsBytes),
    annotation_count: input.annotationCount,
    taxonomy_version: TAXONOMY_VERSION,
    dataset_sha256: input.datasetSha256,
    generated_at: input.generatedAt,
  });
}

/** Canonical meta bytes: fixed key order, 2-space indent, single trailing newline. */
export function serializeAiAnnotationsMeta(meta: AiAnnotationsMeta): string {
  const canonical = {
    schema_version: meta.schema_version,
    annotations_sha256: meta.annotations_sha256,
    annotation_count: meta.annotation_count,
    taxonomy_version: meta.taxonomy_version,
    dataset_sha256: meta.dataset_sha256,
    generated_at: meta.generated_at,
  };
  return JSON.stringify(canonical, null, 2) + '\n';
}
