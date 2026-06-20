import { existsSync, readFileSync } from 'node:fs';
import {
  AGENT_EXECUTION_PROFILE_VERSION,
  DEFAULT_AGENT_EXECUTION_PROFILE,
  AgentExecutionProfileSchema,
} from '@starred/ai-schema';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

/**
 * Versioned agent-executor configuration. This contract intentionally contains
 * no API key, provider, model, or timeout: Claude Routines and Codex
 * Automations are replaceable candidate producers, not trusted core services.
 */
export const AiConfigSchema = z
  .object({
    ai: z
      .object({
        /** Master switch for future planner/executor runs; validation remains available. */
        enabled: z.boolean().default(false),
        /** A prompt bump deliberately invalidates future job fingerprints. */
        prompt_version: z.string().min(1).default('classify-v1'),
        /** The StarLedger-controlled method/cache version, not a provider model id. */
        execution_profile: AgentExecutionProfileSchema.default(DEFAULT_AGENT_EXECUTION_PROFILE),
        /** Hard caps on untrusted input length (implemented with README discovery in P3.1). */
        readme_max_chars: z.number().int().min(1_000).max(200_000).default(30_000),
        metadata_max_chars: z.number().int().min(500).max(50_000).default(5_000),
        /** Per-run job ceilings — hard limits, not an estimated-cost gate. */
        budget: z
          .object({
            max_new_per_run: z.number().int().min(0).default(20),
            max_refresh_per_run: z.number().int().min(0).default(5),
            max_retry_per_run: z.number().int().min(0).default(5),
            max_total_per_run: z.number().int().min(1).default(25),
          })
          .strict()
          .default({}),
      })
      .strict()
      .default({}),
  })
  .strict();

export type AiConfig = z.infer<typeof AiConfigSchema>;

export function loadAiConfig(path?: string): AiConfig {
  if (path !== undefined && existsSync(path)) {
    const raw: unknown = parseYaml(readFileSync(path, 'utf8')) ?? {};
    return AiConfigSchema.parse(raw);
  }
  return AiConfigSchema.parse({
    ai: {
      execution_profile: {
        ...DEFAULT_AGENT_EXECUTION_PROFILE,
        execution_profile_version: AGENT_EXECUTION_PROFILE_VERSION,
      },
    },
  });
}
