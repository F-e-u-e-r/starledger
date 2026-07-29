import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildClassificationManifest, serializeClassificationManifest } from '@starred/ai-schema';
import { describe, expect, it, vi } from 'vitest';
import { buildProgram } from '../src/program';
import { makeDataset, repo } from './helpers';

describe('classifier CLI construction (issue #56)', () => {
  it('REG-1: buildProgram() registers every command and parses nothing at import time', () => {
    const program = buildProgram();
    expect(program.name()).toBe('stars-classify');
    expect(program.commands.map((command) => command.name()).sort()).toEqual([
      'apply',
      'meta-rebase',
      'plan',
      'prune-orphans',
      'validate-candidates',
      'verify-agent-diff',
      'verify-agent-pr',
      'verify-ai-provenance',
      'verify-artifacts',
    ]);
  });
});

/** Sentinel thrown by the process.exit spy so fatal() unwinds instead of exiting. */
class ExitSignal extends Error {
  constructor(readonly code: number | string | null | undefined) {
    super(`exit ${String(code)}`);
  }
}

describe('apply canonical binding (issue #212)', () => {
  it('APPLY-SHA: a manifest from a different canonical snapshot is refused', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'classifier-apply-'));
    const { starsText, metaText } = makeDataset([repo('a')]);
    writeFileSync(join(dir, 'stars.json'), starsText);
    writeFileSync(join(dir, 'dataset-meta.json'), metaText);
    const manifest = buildClassificationManifest({
      promptVersion: 'classify-v1',
      executionProfileVersion: 'agent-v1',
      executorKind: 'claude-routine',
      datasetSha256: 'f'.repeat(64),
      jobs: [],
    });
    writeFileSync(join(dir, 'manifest.json'), serializeClassificationManifest(manifest));
    writeFileSync(
      join(dir, 'candidates.json'),
      `${JSON.stringify({ schema_version: '1.0', candidates: [] })}\n`,
    );
    const stderr: string[] = [];
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?) => {
      throw new ExitSignal(code);
    });
    const errSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk: string | Uint8Array): boolean => {
        stderr.push(String(chunk));
        return true;
      });
    try {
      await expect(
        buildProgram().parseAsync([
          'node',
          'stars-classify',
          'apply',
          '--manifest',
          join(dir, 'manifest.json'),
          '--candidates',
          join(dir, 'candidates.json'),
          '--generated-at',
          '2026-07-29T00:00:00Z',
          '--out-dir',
          dir,
          '--stars',
          join(dir, 'stars.json'),
          '--meta',
          join(dir, 'dataset-meta.json'),
        ]),
      ).rejects.toBeInstanceOf(ExitSignal);
      expect(stderr.join('')).toContain('does not match the verified canonical dataset');
    } finally {
      exitSpy.mockRestore();
      errSpy.mockRestore();
    }
  });
});
