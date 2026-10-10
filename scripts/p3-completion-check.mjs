// P3 completion gate — read-only, credentialed, full-corpus, zero-job verification.
//
// Fails unless ALL hold (see docs/P3-completion-runbook.md):
//   - canonical node_id set equality: missing = extra = duplicates = 0
//   - live `classifier plan --current ai-annotations.json` plans 0 jobs
//   - the manifest's machine-readable plan_summary proves no refresh/retry work
//     was masked by a 0 budget and 0 omitted-unfetchable (issue #207):
//     empty_reason = 'drained-at-base', eligible_new/retry/refresh all 0, omitted 0
//
// It never writes/commits/pushes/opens a PR, and never uploads the manifest
// (only counts + SHAs are reported). STAR_SYNC_TOKEN is used solely for the
// planner's live README reads. The pass/fail decision lives in the pure,
// unit-tested p3-completion-gate.mjs (incl. a budget-masked-work falsification
// case); this file is only its IO wrapper.
import { readFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { evaluateP3Completion } from './p3-completion-gate.mjs';

// Canonical identity inputs (the planner's join key is node_id).
const stars = JSON.parse(readFileSync('stars.json', 'utf8')).repos;
const annotations = JSON.parse(readFileSync('ai-annotations.json', 'utf8')).annotations;

// Live credentialed plan (README discovery needs STAR_SYNC_TOKEN).
mkdirSync('.ai-runs', { recursive: true });
const OUT = '.ai-runs/manifest.json';
const plan = spawnSync(
  'pnpm',
  ['classifier', 'plan', '--current', 'ai-annotations.json', '--out', OUT],
  {
    encoding: 'utf8',
  },
);
const stdout = plan.stdout ?? '';
process.stdout.write(stdout);
if (plan.stderr) process.stderr.write(plan.stderr);

// The manifest is the authoritative result. plan_summary (issue #207) replaces
// the former stdout prose parsing ("AI classification disabled", "omitted N
// probe-ok") with machine-readable fields.
let manifest = null;
try {
  manifest = JSON.parse(readFileSync(OUT, 'utf8'));
} catch (error) {
  process.stderr.write(`unreadable manifest: ${error.message}\n`);
}

const { pass, problems, metrics } = evaluateP3Completion({
  stars,
  annotations,
  manifest,
  planExitStatus: plan.status ?? 1,
});

// Base commit SHA pins the "0 jobs" to a corpus version.
const baseSha = (spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout ?? '').trim();
const show = (v) => (v === null || v === undefined ? '—' : v);

const summary = [
  '# P3 completion check',
  '',
  `- base commit: \`${baseSha}\``,
  `- dataset SHA: \`${metrics.datasetSha}\``,
  `- backlog (node_id sets): stars=${metrics.starCount}, annotations=${metrics.annCount} → missing=${metrics.missing}, extra=${metrics.extra}, duplicates=${metrics.duplicates}`,
  `- planned jobs: ${metrics.jobs}`,
  `- eligible (pre-budget): new=${show(metrics.eligibleNew)}, retry=${show(metrics.eligibleRetry)}, refresh=${show(metrics.eligibleRefresh)}`,
  `- omitted-unfetchable: ${show(metrics.omitted)}`,
  `- deferred-retry (backoff): ${show(metrics.deferredRetry)}`,
  `- empty_reason: ${show(metrics.emptyReason)}`,
  '',
  pass ? '**PASS — P3 completion gate satisfied.**' : `**FAIL** — ${problems.join('; ')}`,
  '',
].join('\n');

process.stdout.write(`\n${summary}`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);

process.exit(pass ? 0 : 1);
