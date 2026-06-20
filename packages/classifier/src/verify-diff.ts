import { execFileSync } from 'node:child_process';

/** The only files an autonomous executor may propose for merge in P3. */
export const AGENT_EDITABLE_PATHS = new Set(['ai-annotations.json', 'ai-annotations-meta.json']);

export class AgentDiffError extends Error {
  constructor(paths: readonly string[]) {
    super(`agent branch changes paths outside the AI artifact allowlist: ${paths.join(', ')}`);
    this.name = 'AgentDiffError';
  }
}

function normalizeRepoPath(path: string): string | null {
  if (!path || path.startsWith('/') || path.includes('\\')) return null;
  const segments = path.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..'))
    return null;
  return segments.join('/');
}

/** Throws unless every changed path is exactly one committed AI artifact path. */
export function verifyAgentDiffPaths(paths: readonly string[]): void {
  const rejected = paths.filter((path) => {
    const normalized = normalizeRepoPath(path);
    return normalized === null || !AGENT_EDITABLE_PATHS.has(normalized);
  });
  if (rejected.length > 0) throw new AgentDiffError(rejected);
}

/** Reads a NUL-delimited Git diff so unusual legal filenames cannot bypass checks. */
export function changedPathsSince(baseRef: string, cwd = process.cwd()): string[] {
  return changedPathsBetween(baseRef, 'HEAD', cwd);
}

/** Compares arbitrary Git refs so trusted CI need never check out agent code. */
export function changedPathsBetween(
  baseRef: string,
  headRef: string,
  cwd = process.cwd(),
): string[] {
  const output = execFileSync('git', ['diff', '--name-only', '-z', `${baseRef}...${headRef}`], {
    encoding: 'buffer',
    cwd,
  });
  return output
    .toString('utf8')
    .split('\0')
    .filter((path) => path.length > 0);
}
