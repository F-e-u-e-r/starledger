// P3 completion gate — read-only, credentialed, full-corpus, zero-job verification.
//
// Fails unless ALL hold (see docs/P3-completion-runbook.md):
//   - canonical node_id set equality: missing = extra = duplicates = 0
//   - live `classifier plan --current ai-annotations.json` plans 0 jobs
//   - 0 omitted-unfetchable (a "0 jobs" that masks un-drained work)
//
// It never writes/commits/pushes/opens a PR, and never uploads the manifest
// (only counts + SHAs are reported). STAR_SYNC_TOKEN is used solely for the
// planner's live README reads.
import { readFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const problems = [];

// 1. Canonical identity (node_id) set equality — the planner's join key.
const stars = JSON.parse(readFileSync('stars.json', 'utf8')).repos;
const anns = JSON.parse(readFileSync('ai-annotations.json', 'utf8')).annotations;
const starIds = new Set(stars.map((r) => r.node_id));
const seen = new Map();
for (const a of anns) seen.set(a.node_id, (seen.get(a.node_id) ?? 0) + 1);
const annIds = new Set(seen.keys());
const missing = [...starIds].filter((id) => !annIds.has(id)).length; // starred but unannotated
const extra = [...annIds].filter((id) => !starIds.has(id)).length; // annotated but not a current star
const duplicates = [...seen.values()].reduce((n, c) => n + (c - 1), 0);
if (missing !== 0 || extra !== 0 || duplicates !== 0) {
  problems.push('backlog not drained (node_id set inequality)');
}

// 2. Live credentialed plan (README discovery needs STAR_SYNC_TOKEN).
mkdirSync('.ai-runs', { recursive: true });
const OUT = '.ai-runs/manifest.json';
const plan = spawnSync(
  'pnpm',
  ['classifier', 'plan', '--current', 'ai-annotations.json', '--out', OUT],
  { encoding: 'utf8' },
);
const stdout = plan.stdout ?? '';
process.stdout.write(stdout);
if (plan.stderr) process.stderr.write(plan.stderr);
if (plan.status !== 0) problems.push(`classifier plan exited ${plan.status}`);
if (/AI classification disabled/.test(stdout)) {
  problems.push('AI classification disabled — no live discovery ran');
}

// 3. Jobs + dataset SHA from the manifest (never print its content).
let jobs = Number.NaN;
let datasetSha = 'unknown';
try {
  const manifest = JSON.parse(readFileSync(OUT, 'utf8'));
  jobs = Array.isArray(manifest.jobs) ? manifest.jobs.length : Number.NaN;
  datasetSha = manifest.dataset_sha256 ?? 'unknown';
} catch (error) {
  problems.push(`unreadable manifest: ${error.message}`);
}
if (jobs !== 0) problems.push(`planned jobs = ${jobs} (want 0)`);

// 4. Omitted-unfetchable (README probe ok, bytes not fetchable → re-plans later).
const omittedMatch = stdout.match(/omitted (\d+) probe-ok/);
const omitted = omittedMatch ? Number(omittedMatch[1]) : 0;
if (omitted !== 0) problems.push(`omitted-unfetchable = ${omitted} (want 0)`);

// 5. Base commit SHA (pins the "0 jobs" to a corpus version).
const baseSha = (spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout ?? '').trim();

const pass = problems.length === 0;
const summary = [
  '# P3 completion check',
  '',
  `- base commit: \`${baseSha}\``,
  `- dataset SHA: \`${datasetSha}\``,
  `- backlog (node_id sets): stars=${starIds.size}, annotations=${anns.length} → missing=${missing}, extra=${extra}, duplicates=${duplicates}`,
  `- planned jobs: ${jobs}`,
  `- omitted-unfetchable: ${omitted}`,
  '',
  pass ? '**PASS — P3 completion gate satisfied.**' : `**FAIL** — ${problems.join('; ')}`,
  '',
].join('\n');

process.stdout.write(`\n${summary}`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);

process.exit(pass ? 0 : 1);
