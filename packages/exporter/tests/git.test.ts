import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RealGitPublisher, redactGitOutput } from '../src/git';

/** Run git in `cwd`, returning trimmed stdout. */
function g(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

/** A bare "remote" plus a work clone whose `main` is pushed and checked out. */
function initRepo(): { work: string; remote: string; c0: string } {
  const base = mkdtempSync(join(tmpdir(), 'stars-git-'));
  const remote = join(base, 'remote.git');
  const work = join(base, 'work');
  execFileSync('git', ['init', '--bare', remote]);
  execFileSync('git', ['clone', '--quiet', remote, work]);
  g(work, 'config', 'user.email', 'tester@example.com');
  g(work, 'config', 'user.name', 'Tester');
  writeFileSync(join(work, 'stars.json'), '{"repos":[]}\n');
  g(work, 'add', 'stars.json');
  g(work, 'commit', '--quiet', '-m', 'init');
  g(work, 'push', '--quiet', 'origin', 'HEAD:refs/heads/main');
  return { work, remote, c0: g(work, 'rev-parse', 'HEAD') };
}

/** Detach HEAD at `sha` and stage a new dataset commit (no push yet). */
function detachAndCommit(work: string, sha: string, content: string): void {
  g(work, 'checkout', '--quiet', '--detach', sha);
  writeFileSync(join(work, 'stars.json'), content);
  g(work, 'add', 'stars.json');
  g(work, 'commit', '--quiet', '-m', 'chore(data): update starred repositories');
}

describe('RealGitPublisher.push — detached-HEAD publication', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    delete process.env.STARLEDGER_PUBLISH_BRANCH;
    delete process.env.GITHUB_REF_NAME;
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it('publishes from detached HEAD to STARLEDGER_PUBLISH_BRANCH (the CI failure)', async () => {
    const { work, remote, c0 } = initRepo();
    detachAndCommit(work, c0, '{"repos":[{"node_id":"R_1"}]}\n');
    process.env.STARLEDGER_PUBLISH_BRANCH = 'main';

    await new RealGitPublisher(work).push();

    expect(g(remote, 'rev-parse', 'refs/heads/main')).toBe(g(work, 'rev-parse', 'HEAD'));
  });

  it('falls back to GITHUB_REF_NAME when no explicit branch is set', async () => {
    const { work, remote, c0 } = initRepo();
    detachAndCommit(work, c0, '{"repos":[{"node_id":"R_2"}]}\n');
    process.env.GITHUB_REF_NAME = 'main';

    await new RealGitPublisher(work).push();

    expect(g(remote, 'rev-parse', 'refs/heads/main')).toBe(g(work, 'rev-parse', 'HEAD'));
  });

  it('explicit STARLEDGER_PUBLISH_BRANCH wins over GITHUB_REF_NAME', async () => {
    const { work, remote, c0 } = initRepo();
    detachAndCommit(work, c0, '{"repos":[{"node_id":"R_3"}]}\n');
    process.env.STARLEDGER_PUBLISH_BRANCH = 'main';
    process.env.GITHUB_REF_NAME = 'does-not-exist';

    await new RealGitPublisher(work).push();

    expect(g(remote, 'rev-parse', 'refs/heads/main')).toBe(g(work, 'rev-parse', 'HEAD'));
    // The wrong branch was never created on the remote.
    expect(() => g(remote, 'rev-parse', 'refs/heads/does-not-exist')).toThrow();
  });

  it('fails closed with an actionable message when the branch is unresolvable', async () => {
    const { work, c0 } = initRepo();
    detachAndCommit(work, c0, '{"repos":[{"node_id":"R_4"}]}\n');
    // Detached HEAD and neither env var set.
    await expect(new RealGitPublisher(work).push()).rejects.toThrow(
      /cannot determine target branch/,
    );
  });

  it('surfaces git stderr on a rejected push instead of swallowing it', async () => {
    const { work, c0 } = initRepo();
    // Advance remote main to c1, then build a divergent commit on c0 → non-fast-forward.
    writeFileSync(join(work, 'stars.json'), '{"repos":[{"node_id":"C1"}]}\n');
    g(work, 'add', 'stars.json');
    g(work, 'commit', '--quiet', '-m', 'c1');
    g(work, 'push', '--quiet', 'origin', 'HEAD:refs/heads/main');
    detachAndCommit(work, c0, '{"repos":[{"node_id":"DIVERGENT"}]}\n');
    process.env.STARLEDGER_PUBLISH_BRANCH = 'main';

    await expect(new RealGitPublisher(work).push()).rejects.toThrow(
      /git push .* failed:.*(rejected|fetch first|non-fast-forward)/is,
    );
  });
});

describe('redactGitOutput', () => {
  it('strips embedded credentials from remote URLs', () => {
    expect(
      redactGitOutput(
        "fatal: unable to access 'https://x-access-token:ghs_SECRET@github.com/o/r.git/'",
      ),
    ).toBe("fatal: unable to access 'https://***@github.com/o/r.git/'");
  });

  it('leaves credential-free output unchanged', () => {
    expect(redactGitOutput('fatal: You are not currently on a branch')).toBe(
      'fatal: You are not currently on a branch',
    );
  });
});
