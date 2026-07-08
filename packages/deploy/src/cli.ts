import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { argv, env, exit } from 'node:process';
import { verifyDatasetIntegrity } from './dataset';
import { evaluateDeployFreshness } from './freshness';
import { writeFixtureDataset } from './fixture';
import {
  DATASET_META_FILE,
  STARS_FILE,
  stageAiArtifacts,
  stageDashboardData,
  stageDiscoveryArtifacts,
} from './stage';
import { staticSmoke, verifyBuiltArtifact } from './verify';

const repoRoot = resolve(import.meta.dirname, '../../..');
const DEFAULT_DIST = resolve(repoRoot, 'apps/dashboard/dist');

function flag(name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}

/** Mirror the dashboard's vite.config base-path derivation. */
function derivedBase(): string {
  const repo = env.GITHUB_REPOSITORY?.split('/')[1];
  return env.GITHUB_ACTIONS && repo ? `/${repo}/` : '/';
}

/** Best-effort append to the GitHub Actions run summary (no-op off CI). */
function appendStepSummary(markdown: string): void {
  const path = env.GITHUB_STEP_SUMMARY;
  if (!path) return;
  try {
    appendFileSync(path, markdown + '\n');
  } catch {
    /* the summary is diagnostic only; never let it fail the check */
  }
}

async function main(): Promise<void> {
  const cmd = argv[2];
  const dist = flag('dist') ?? DEFAULT_DIST;
  const data = flag('data') ?? repoRoot;
  const base = flag('base') ?? derivedBase();

  switch (cmd) {
    case 'stage': {
      const r = stageDashboardData({ dataDir: data, distDir: dist });
      console.log(`[deploy] staged ${r.repoCount} repos (sha ${r.sha256.slice(0, 12)}…) → ${dist}`);
      const ai = stageAiArtifacts({ dataDir: data, distDir: dist });
      console.log(`[deploy] AI artifacts: ${ai.staged ? 'staged' : `skipped (${ai.reason})`}`);
      const discovery = stageDiscoveryArtifacts({ dataDir: data, distDir: dist });
      console.log(
        `[deploy] Discovery artifacts: ${
          discovery.staged ? 'staged' : `skipped (${discovery.reason})`
        }`,
      );
      break;
    }
    case 'verify': {
      const r = verifyBuiltArtifact({ distDir: dist, base });
      console.log(`[deploy] dist verified: ${r.repoCount} repos, base ${r.base}`);
      break;
    }
    case 'smoke': {
      const r = await staticSmoke({ distDir: dist, base });
      console.log(`[deploy] static smoke OK: ${r.repoCount} repos, base ${r.base}`);
      break;
    }
    case 'check-data': {
      const starsPath = resolve(data, STARS_FILE);
      const metaPath = resolve(data, DATASET_META_FILE);
      if (!existsSync(starsPath) || !existsSync(metaPath)) {
        throw new Error(`canonical data not found in ${data}`);
      }
      const r = verifyDatasetIntegrity(
        readFileSync(starsPath, 'utf8'),
        readFileSync(metaPath, 'utf8'),
      );
      console.log(`[deploy] data OK: ${r.meta.repo_count} repos (sha ${r.sha256.slice(0, 12)}…)`);
      break;
    }
    case 'fixture': {
      const out = flag('out') ?? data;
      const r = writeFixtureDataset(out);
      console.log(`[deploy] wrote fixture dataset (${r.repoCount} repos) → ${out}`);
      break;
    }
    case 'freshness': {
      // OPS-A: compare the PUBLIC live dataset-meta.json against main HEAD's
      // VERIFIED fingerprint (evaluateDeployFreshness re-hashes stars.json so a
      // stale committed meta can't self-certify). Read-only; needs no secret.
      // Exit 3 on drift so the scheduled run fails visibly (a one-off can be a
      // deploy in flight; a persistent red is a silent freeze). Exit 1 (via
      // main().catch) if the dataset/live site is unverifiable — never "fresh".
      const outcome = await evaluateDeployFreshness({
        dataDir: data,
        url: flag('url'),
        repoSlug: env.GITHUB_REPOSITORY,
      });
      if (outcome.status === 'fresh') {
        console.log(
          `[deploy] freshness OK: live site matches main HEAD (${outcome.expectedSha.slice(0, 12)}…)`,
        );
        break;
      }
      console.error(
        `[deploy] DRIFT: live site is serving ${outcome.liveSha.slice(0, 12)}… but main HEAD is ` +
          `${outcome.expectedSha.slice(0, 12)}… — deploy drift (OPS-A)`,
      );
      appendStepSummary(
        `### ⚠️ Deploy freshness drift (OPS-A)\n\n` +
          `- live \`stars_sha256\`: \`${outcome.liveSha}\`\n` +
          `- main HEAD \`stars_sha256\`: \`${outcome.expectedSha}\`\n\n` +
          `The published site does not match main HEAD. A single occurrence can be a ` +
          `deploy in flight; a persistent drift is a silent freeze — see the OPS-A ` +
          `invariant in \`.github/workflows/sync-stars.yml\`.`,
      );
      exit(3);
      break;
    }
    default:
      console.error(
        'usage: deploy <stage|verify|smoke|fixture|freshness> [--data dir] [--dist dir] [--base /x/] [--out dir] [--url URL]',
      );
      exit(2);
  }
}

main().catch((err: unknown) => {
  console.error(`[deploy] ${err instanceof Error ? err.message : String(err)}`);
  exit(1);
});
