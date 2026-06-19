// Real-Git notifier state-branch smoke (P2 release gate).
// Exercises the real GitStateStore plumbing against a bare remote:
//   cold load → null · first save creates the orphan state branch & pushes ·
//   load round-trips · commit-on-change (unchanged save is a no-op) ·
//   a changed save pushes a new commit · a REJECTED push (pre-receive hook)
//   leaves the remote unchanged · a schema-invalid document never loads.
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { GitStateStore, NotifierConfigSchema, emptyState, serializeState, loadState } = await import(
  join(root, 'packages/notifier/dist/index.js')
);

const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: 'pipe' }).toString();
const assert = (cond, msg) => {
  if (!cond) throw new Error(`SMOKE FAILED: ${msg}`);
};

const config = NotifierConfigSchema.parse({ youtube: { channels: ['UC_smoke'] } });
const bytesFor = (sha) => {
  const s = emptyState(config);
  s.awesome_stars.initialized = true;
  s.awesome_stars.last_commit_sha = sha;
  return serializeState(s);
};
const bytesA = bytesFor('sha-A');
const bytesB = bytesFor('sha-B');
const bytesC = bytesFor('sha-C');

const work = mkdtempSync(join(tmpdir(), 'notifier-smoke-work-'));
const bare = mkdtempSync(join(tmpdir(), 'notifier-smoke-bare-'));
try {
  git(bare, 'init', '--bare', '-q', '.');
  git(work, 'init', '-q', '.');
  git(work, 'config', 'user.email', 'smoke@example.com');
  git(work, 'config', 'user.name', 'smoke');
  git(work, 'commit', '-q', '--allow-empty', '-m', 'init');
  git(work, 'branch', '-M', 'main');
  git(work, 'remote', 'add', 'origin', bare);
  git(work, 'push', '-q', '-u', 'origin', 'main');

  const store = new GitStateStore(work, {
    branch: 'starledger-state',
    file: 'notifier-state.json',
    remote: 'origin',
  });

  // 1. cold load → null (no state branch yet)
  assert((await store.load()) === null, 'cold load must return null');

  // 2. first save creates the orphan state branch and pushes
  const r1 = await store.save(bytesA, 'state A');
  assert(r1.changed && r1.committed && r1.pushed, 'first save must commit + push');
  assert(
    git(bare, 'show', 'starledger-state:notifier-state.json') === bytesA,
    'remote state file must equal bytesA',
  );
  const tracked = git(bare, 'ls-tree', '--name-only', 'starledger-state').trim().split('\n');
  assert(
    tracked.length === 1 && tracked[0] === 'notifier-state.json',
    'state branch must contain ONLY the state file (orphan, no working-tree spill)',
  );
  // the state branch must NOT descend from main (it is an independent root)
  const sharedBase = (() => {
    try {
      return git(work, 'merge-base', 'main', 'origin/starledger-state').trim();
    } catch {
      return '';
    }
  })();
  assert(
    sharedBase === '',
    'state branch must be an independent root (no shared history with main)',
  );

  // 3. load round-trips the bytes
  assert((await store.load()) === bytesA, 'load must return the persisted bytesA');

  // 4. commit-on-change: an identical save is a no-op
  const r2 = await store.save(bytesA, 'state A again');
  assert(!r2.changed && !r2.committed && !r2.pushed, 'unchanged save must be a no-op');
  const count1 = git(bare, 'log', '--oneline', 'starledger-state')
    .trim()
    .split('\n')
    .filter(Boolean).length;
  assert(count1 === 1, 'remote must still have exactly one state commit');

  // 5. a changed save pushes a new commit
  const r3 = await store.save(bytesB, 'state B');
  assert(r3.changed && r3.pushed, 'changed save must push');
  assert(git(bare, 'show', 'starledger-state:notifier-state.json') === bytesB, 'remote must be B');
  const count2 = git(bare, 'log', '--oneline', 'starledger-state')
    .trim()
    .split('\n')
    .filter(Boolean).length;
  assert(count2 === 2, 'remote must have two state commits');

  // 6. a rejected push leaves the remote unchanged (pre-receive hook exits 1)
  const hook = join(bare, 'hooks', 'pre-receive');
  writeFileSync(hook, '#!/bin/sh\nexit 1\n');
  chmodSync(hook, 0o755);
  const r4 = await store.save(bytesC, 'state C');
  assert(r4.changed && r4.committed && !r4.pushed, 'rejected push must report pushed=false');
  assert(
    git(bare, 'show', 'starledger-state:notifier-state.json') === bytesB,
    'remote last-known-good (B) must survive a rejected push',
  );
  rmSync(hook, { force: true });

  // 7. a schema-invalid document never loads (validate-before-replace)
  let threw = false;
  try {
    loadState('{ "schema_version": "1.0" }', config);
  } catch {
    threw = true;
  }
  assert(threw, 'a schema-invalid state must throw rather than load');

  console.log('✓ real-git notifier state-branch smoke PASSED');
} finally {
  rmSync(work, { recursive: true, force: true });
  rmSync(bare, { recursive: true, force: true });
}
