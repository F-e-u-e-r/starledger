import { describe, expect, it } from 'vitest';
import { AiConfigSchema, loadAiConfig } from '../src/config';

describe('AiConfigSchema', () => {
  it('applies the documented defaults', () => {
    const config = AiConfigSchema.parse({});
    expect(config.ai.enabled).toBe(false);
    expect(config.ai.prompt_version).toBe('classify-v1');
    expect(config.ai.execution_profile.execution_profile_version).toBe('agent-v1');
    expect(config.ai.execution_profile.allowed_executors).toEqual([
      'claude-routine',
      'codex-automation',
    ]);
    expect(config.ai.budget.max_total_per_run).toBe(25);
  });

  it('rejects unknown keys (strict)', () => {
    expect(AiConfigSchema.safeParse({ ai: { nope: true } }).success).toBe(false);
    expect(AiConfigSchema.safeParse({ whatever: 1 }).success).toBe(false);
  });

  it('bounds untrusted input and per-run budget', () => {
    expect(AiConfigSchema.safeParse({ ai: { readme_max_chars: 10 } }).success).toBe(false);
    expect(AiConfigSchema.safeParse({ ai: { budget: { max_total_per_run: 0 } } }).success).toBe(
      false,
    );
  });

  it('loads defaults when no config path is given', () => {
    expect(loadAiConfig().ai.enabled).toBe(false);
  });

  it('rejects API-provider configuration; P3.0 uses executor-neutral contracts', () => {
    expect(AiConfigSchema.safeParse({ ai: { provider: 'anthropic' } }).success).toBe(false);
    expect(AiConfigSchema.safeParse({ ai: { model: 'gpt-5.5' } }).success).toBe(false);
  });
});
