import { z } from 'zod';
import { AI_SCHEMA_VERSION } from './artifact';
import { AgentExecutorKindSchema } from './execution-profile';
import {
  canonicalizeClassificationJob,
  ClassificationJobSchema,
  type ClassificationJob,
} from './job';
import { TAXONOMY_VERSION } from './taxonomy';

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** A deterministic, temporary bounded work list for one agent execution. */
export const ClassificationManifestSchema = z
  .object({
    schema_version: z.literal(AI_SCHEMA_VERSION),
    taxonomy_version: z.literal(TAXONOMY_VERSION),
    prompt_version: z.string().min(1),
    execution_profile_version: z.string().min(1),
    executor_kind: AgentExecutorKindSchema,
    jobs: z.array(ClassificationJobSchema),
  })
  .strict()
  .superRefine((manifest, ctx) => {
    const nodeIds = manifest.jobs.map((job) => job.node_id);
    if (new Set(nodeIds).size !== nodeIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['jobs'],
        message: 'jobs must have unique node_id',
      });
    }
    const sorted = [...nodeIds].sort(compareText);
    if (nodeIds.some((nodeId, index) => nodeId !== sorted[index])) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['jobs'],
        message: 'jobs must be sorted by node_id ascending',
      });
    }
    for (const [index, job] of manifest.jobs.entries()) {
      if (
        job.taxonomy_version !== manifest.taxonomy_version ||
        job.prompt_version !== manifest.prompt_version ||
        job.execution_profile_version !== manifest.execution_profile_version ||
        job.executor_kind !== manifest.executor_kind
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['jobs', index],
          message: 'job versions must match the manifest versions',
        });
      }
    }
  });
export type ClassificationManifest = z.infer<typeof ClassificationManifestSchema>;

export interface BuildClassificationManifestInput {
  promptVersion: string;
  executionProfileVersion: string;
  executorKind: z.infer<typeof AgentExecutorKindSchema>;
  jobs: readonly ClassificationJob[];
}

export function buildClassificationManifest(
  input: BuildClassificationManifestInput,
): ClassificationManifest {
  return ClassificationManifestSchema.parse({
    schema_version: AI_SCHEMA_VERSION,
    taxonomy_version: TAXONOMY_VERSION,
    prompt_version: input.promptVersion,
    execution_profile_version: input.executionProfileVersion,
    executor_kind: input.executorKind,
    jobs: [...input.jobs].sort((a, b) => compareText(a.node_id, b.node_id)),
  });
}

export function serializeClassificationManifest(manifest: ClassificationManifest): string {
  const validated = ClassificationManifestSchema.parse(manifest);
  return (
    JSON.stringify(
      {
        schema_version: validated.schema_version,
        taxonomy_version: validated.taxonomy_version,
        prompt_version: validated.prompt_version,
        execution_profile_version: validated.execution_profile_version,
        executor_kind: validated.executor_kind,
        jobs: validated.jobs.map(canonicalizeClassificationJob),
      },
      null,
      2,
    ) + '\n'
  );
}
