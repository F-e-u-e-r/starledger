import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

/**
 * Strip embedded credentials from any remote URL in git output (e.g. the
 * `https://x-access-token:<TOKEN>@github.com/...` form a CI token push uses), so
 * a surfaced git error can never leak the push credential into logs.
 */
export function redactGitOutput(s: string): string {
  return s.replace(/([a-z][a-z0-9+.-]*:\/\/)[^/\s@]+@/gi, '$1***@');
}

/**
 * Run a git subcommand, surfacing git's own (redacted) stderr on failure.
 * execFile rejects with an Error whose `.stderr` holds git's diagnostics;
 * without forwarding it the real reason (e.g. "You are not currently on a
 * branch") is lost and the caller sees only an opaque non-zero exit.
 */
async function git(cwd: string, args: readonly string[]): Promise<string> {
  try {
    const { stdout } = await exec('git', [...args], { cwd });
    return stdout;
  } catch (err) {
    const e = err as { stderr?: string; message?: string };
    const detail = redactGitOutput((e.stderr || e.message || '').trim());
    throw new Error(`git ${args.join(' ')} failed: ${detail}`);
  }
}

/**
 * The Git publication boundary. The remote publication unit is a single commit
 * containing both stars.json and dataset-meta.json; a reader only ever sees the
 * previous valid commit or the next complete one. Injected for tests.
 */
export interface GitPublisher {
  /** Stage the given files (relative to the repo) and create ONE commit. */
  commit(files: readonly string[], message: string): Promise<void>;
  push(): Promise<void>;
}

export class RealGitPublisher implements GitPublisher {
  constructor(private readonly cwd: string) {}

  async commit(files: readonly string[], message: string): Promise<void> {
    await git(this.cwd, ['add', '--', ...files]);
    await git(this.cwd, ['commit', '-m', message]);
  }

  async push(): Promise<void> {
    // CI commonly checks out the event SHA in DETACHED HEAD (actions/checkout
    // pins the commit, not the branch). A bare `git push` then fails with
    // "You are not currently on a branch", so resolve the target branch and
    // push an explicit refspec — correct on a branch too.
    const branch = await this.resolvePushBranch();
    await git(this.cwd, ['push', 'origin', `HEAD:refs/heads/${branch}`]);
  }

  /**
   * Determine which remote branch HEAD should be published to. Explicit config
   * wins so the same exporter behaves identically across the production repo,
   * the template, and forks with a non-`main` default branch:
   *   1. STARLEDGER_PUBLISH_BRANCH (operator-set, e.g. from the workflow);
   *   2. GITHUB_REF_NAME (GitHub Actions provides the triggering branch);
   *   3. the checked-out branch, if not detached;
   *   4. else fail closed with an actionable message.
   */
  private async resolvePushBranch(): Promise<string> {
    const explicit = process.env.STARLEDGER_PUBLISH_BRANCH?.trim();
    if (explicit) return explicit;

    const ciBranch = process.env.GITHUB_REF_NAME?.trim();
    if (ciBranch) return ciBranch;

    try {
      const head = (await git(this.cwd, ['symbolic-ref', '--short', 'HEAD'])).trim();
      if (head) return head;
    } catch {
      // Detached HEAD: `symbolic-ref` exits non-zero; fall through to error.
    }

    throw new Error(
      'cannot determine target branch to push: detached HEAD and neither ' +
        'STARLEDGER_PUBLISH_BRANCH nor GITHUB_REF_NAME is set. Set one, or run on a branch.',
    );
  }
}
