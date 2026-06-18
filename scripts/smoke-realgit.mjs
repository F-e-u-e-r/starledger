// Built-artifact + real-Git publication smoke (P0.6.3 release gate).
// Verifies the real RealGitPublisher path: one commit of both files, pushed to a
// bare remote, dataset-meta sha == committed stars bytes (HASH-2), private repo
// filtered, and run-meta NOT tracked.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { run } = await import(join(root, 'packages/exporter/dist/index.js'));

const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: 'pipe' }).toString();
const assert = (cond, msg) => {
  if (!cond) throw new Error(`SMOKE FAILED: ${msg}`);
};

const RATE = { cost: 2, remaining: 4998, resetAt: '2026-06-18T01:00:00Z' };
const mkNode = (id, nwo, extra = {}) => ({
  id,
  nameWithOwner: nwo,
  name: nwo.split('/')[1],
  owner: { login: nwo.split('/')[0] },
  url: `https://github.com/${nwo}`,
  description: null,
  homepageUrl: null,
  stargazerCount: 5,
  forkCount: 0,
  isArchived: false,
  isDisabled: false,
  isFork: false,
  isPrivate: false,
  createdAt: '2020-01-01T00:00:00Z',
  pushedAt: null,
  updatedAt: '2020-01-02T00:00:00Z',
  primaryLanguage: null,
  licenseInfo: null,
  repositoryTopics: { nodes: [] },
  issues: { totalCount: 0 },
  latestRelease: null,
  releases: { nodes: [] },
  ...extra,
});
const edges = [
  { starredAt: '2026-05-01T00:00:00Z', node: mkNode('R_pub', 'a/pub') },
  { starredAt: '2026-04-01T00:00:00Z', node: mkNode('R_priv', 'a/priv', { isPrivate: true }) },
];
const graphql = async (q) =>
  q.includes('query Probe')
    ? {
        rateLimit: RATE,
        viewer: { login: 'a', starredRepositories: { isOverLimit: false, totalCount: 2 } },
      }
    : {
        rateLimit: RATE,
        viewer: {
          starredRepositories: {
            isOverLimit: false,
            totalCount: 2,
            pageInfo: { hasNextPage: false, endCursor: null },
            edges,
          },
        },
      };
const rest = {
  async fetchStarredPage() {
    return { rows: [], linkHeader: null };
  },
};

const work = mkdtempSync(join(tmpdir(), 'stars-smoke-work-'));
const bare = mkdtempSync(join(tmpdir(), 'stars-smoke-bare-'));
try {
  git(bare, 'init', '--bare', '-q', '.');
  git(work, 'init', '-q', '.');
  git(work, 'config', 'user.email', 'smoke@example.com');
  git(work, 'config', 'user.name', 'smoke');
  git(work, 'commit', '-q', '--allow-empty', '-m', 'init');
  git(work, 'branch', '-M', 'main');
  git(work, 'remote', 'add', 'origin', bare);
  git(work, 'push', '-q', '-u', 'origin', 'main');

  const outcome = await run({
    outDir: work,
    graphql,
    rest,
    now: () => new Date('2026-06-18T00:00:00Z'),
  });
  assert(outcome.published === true, 'expected published=true');
  assert(outcome.changed === true, 'expected changed=true');

  const starsBytes = readFileSync(join(work, 'stars.json'), 'utf8');
  const stars = JSON.parse(starsBytes);
  assert(
    stars.repos.length === 1 && stars.repos[0].node_id === 'R_pub',
    'private repo must be filtered',
  );
  assert(!('is_private' in stars.repos[0]), 'output must not carry is_private');

  const meta = JSON.parse(readFileSync(join(work, 'dataset-meta.json'), 'utf8'));
  assert(
    meta.stars_sha256 === sha256(starsBytes),
    'HASH-2: dataset-meta sha must equal committed stars bytes',
  );

  const tracked = git(work, 'ls-files').split('\n');
  assert(
    tracked.includes('stars.json') && tracked.includes('dataset-meta.json'),
    'both files must be tracked',
  );
  assert(!tracked.includes('run-meta.json'), 'run-meta.json must NOT be tracked');

  const head = git(work, 'show', '--stat', '--oneline', 'HEAD');
  assert(/chore\(data\): update starred repositories/.test(head), 'single data commit message');
  assert(
    /stars\.json/.test(head) && /dataset-meta\.json/.test(head),
    'one commit contains both files',
  );

  const remoteLog = git(bare, 'log', '--oneline');
  assert(
    remoteLog.split('\n').filter(Boolean).length === 2,
    'remote must have received exactly the new commit',
  );

  console.log('✓ real-git publication smoke PASSED');
} finally {
  rmSync(work, { recursive: true, force: true });
  rmSync(bare, { recursive: true, force: true });
}
