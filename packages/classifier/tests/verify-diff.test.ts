import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AgentDiffError, changedPathsBetween, verifyAgentDiffPaths } from '../src/verify-diff';

function git(repo: string, args: readonly string[]): string {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
}

describe('agent diff allowlist', () => {
  it('DIFF-1: accepts only the two public AI artifact paths', () => {
    expect(() => {
      verifyAgentDiffPaths(['ai-annotations.json', 'ai-annotations-meta.json']);
    }).not.toThrow();
  });

  it('DIFF-2/DIFF-3: rejects canonical datasets, source, workflow, and configuration changes', () => {
    for (const path of [
      'stars.json',
      'dataset-meta.json',
      'packages/classifier/src/cli.ts',
      '.github/workflows/classify.yml',
      'config/ai.yaml',
      '../ai-annotations.json',
    ]) {
      expect(() => verifyAgentDiffPaths([path])).toThrow(AgentDiffError);
    }
  });

  it('DIFF-4: reads real Git diffs before applying the agent path allowlist', () => {
    const repo = mkdtempSync(join(tmpdir(), 'starledger-agent-diff-'));
    git(repo, ['init']);
    git(repo, ['config', 'user.name', 'StarLedger Test']);
    git(repo, ['config', 'user.email', 'starledger-test@example.com']);
    git(repo, ['commit', '--allow-empty', '-m', 'base']);
    const base = git(repo, ['rev-parse', 'HEAD']);

    writeFileSync(join(repo, 'ai-annotations.json'), '{}\n', 'utf8');
    writeFileSync(join(repo, 'ai-annotations-meta.json'), '{}\n', 'utf8');
    git(repo, ['add', 'ai-annotations.json', 'ai-annotations-meta.json']);
    git(repo, ['commit', '-m', 'agent artifacts']);
    const artifactHead = git(repo, ['rev-parse', 'HEAD']);
    const allowedPaths = changedPathsBetween(base, artifactHead, repo);
    expect(allowedPaths.sort()).toEqual(['ai-annotations-meta.json', 'ai-annotations.json']);
    expect(() => verifyAgentDiffPaths(allowedPaths)).not.toThrow();

    mkdirSync(join(repo, 'packages/classifier/src'), { recursive: true });
    writeFileSync(join(repo, 'packages/classifier/src/cli.ts'), 'export {};\n', 'utf8');
    git(repo, ['add', 'packages/classifier/src/cli.ts']);
    git(repo, ['commit', '-m', 'agent source edit']);
    const rejectedPaths = changedPathsBetween(base, 'HEAD', repo);
    expect(rejectedPaths).toContain('packages/classifier/src/cli.ts');
    expect(() => verifyAgentDiffPaths(rejectedPaths)).toThrow(AgentDiffError);
  });
});
