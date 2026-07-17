import { describe, expect, it } from 'vitest';
import { buildProgram } from '../src/program';

describe('classifier CLI construction (issue #56)', () => {
  it('REG-1: buildProgram() registers every command and parses nothing at import time', () => {
    const program = buildProgram();
    expect(program.name()).toBe('stars-classify');
    expect(program.commands.map((command) => command.name()).sort()).toEqual([
      'apply',
      'meta-rebase',
      'plan',
      'validate-candidates',
      'verify-agent-diff',
      'verify-agent-pr',
      'verify-ai-provenance',
      'verify-artifacts',
    ]);
  });
});
