// Public-only PAT smoke (P0.6.1 credential hygiene). Runs the REAL exporter
// against GitHub with STAR_SYNC_TOKEN and asserts private_filtered == 0 — i.e.
// the token has no private-repo scope. CI-only; skipped without a token.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

if (!process.env.STAR_SYNC_TOKEN) {
  console.log('skipped (STAR_SYNC_TOKEN not set)');
  process.exit(0);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { run } = await import(join(root, 'packages/exporter/dist/index.js'));
const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: 'pipe' }).toString();
const assert = (cond, msg) => {
  if (!cond) throw new Error(`PUBLIC-PAT SMOKE FAILED: ${msg}`);
};

const work = mkdtempSync(join(tmpdir(), 'stars-pat-work-'));
const bare = mkdtempSync(join(tmpdir(), 'stars-pat-bare-'));
try {
  git(bare, 'init', '--bare', '-q', '.');
  git(work, 'init', '-q', '.');
  git(work, 'config', 'user.email', 'pat@example.com');
  git(work, 'config', 'user.name', 'pat');
  git(work, 'commit', '-q', '--allow-empty', '-m', 'init');
  git(work, 'branch', '-M', 'main');
  git(work, 'remote', 'add', 'origin', bare);
  git(work, 'push', '-q', '-u', 'origin', 'main');

  await run({ outDir: work });
  const meta = JSON.parse(readFileSync(join(work, 'run-meta.json'), 'utf8'));
  assert(
    meta.counts.private_filtered === 0,
    `public-only PAT must filter 0 private repos (got ${meta.counts.private_filtered})`,
  );
  console.log(`✓ public-only PAT smoke PASSED (exported ${meta.counts.exported})`);
} finally {
  rmSync(work, { recursive: true, force: true });
  rmSync(bare, { recursive: true, force: true });
}
