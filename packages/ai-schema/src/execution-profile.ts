import { z } from 'zod';

/**
 * A StarLedger-controlled classification methodology version. Bump this when
 * the agent instructions, selected model, reasoning level, or executor policy
 * changes in a way that should deliberately reclassify repositories.
 */
export const AGENT_EXECUTION_PROFILE_VERSION = 'agent-v1';

export const AGENT_EXECUTOR_KINDS = ['claude-routine', 'codex-automation'] as const;
export const AgentExecutorKindSchema = z.enum(AGENT_EXECUTOR_KINDS);
export type AgentExecutorKind = z.infer<typeof AgentExecutorKindSchema>;

/**
 * Executor capabilities are configuration, not trust. Both supported executors
 * must emit the same candidate contract and pass the same deterministic gate.
 */
export const AgentExecutionProfileSchema = z
  .object({
    execution_profile_version: z.string().min(1),
    allowed_executors: z.array(AgentExecutorKindSchema).min(1),
  })
  .strict()
  .superRefine((profile, ctx) => {
    if (new Set(profile.allowed_executors).size !== profile.allowed_executors.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'allowed_executors must be unique' });
    }
    const sorted = [...profile.allowed_executors].sort();
    if (profile.allowed_executors.some((executor, index) => executor !== sorted[index])) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'allowed_executors must be sorted ascending',
      });
    }
  });
export type AgentExecutionProfile = z.infer<typeof AgentExecutionProfileSchema>;

export const DEFAULT_AGENT_EXECUTION_PROFILE: AgentExecutionProfile = {
  execution_profile_version: AGENT_EXECUTION_PROFILE_VERSION,
  allowed_executors: ['claude-routine', 'codex-automation'],
};
