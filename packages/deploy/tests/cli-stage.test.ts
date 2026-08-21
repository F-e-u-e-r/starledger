import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  SKILLS_CLASSIFICATION_FILE,
  SKILLS_CLASSIFICATION_META_FILE,
  STARS_FILE,
} from '../src/stage';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * CLI-level staging regression (review finding K7): the direct
 * stageSkillsArtifacts tests cannot see whether cli.ts actually CALLS it —
 * deleting the wiring would leave them green. This drives the real `stage`
 * command against the repo's own committed data (stars + the M2.2 artifacts)
 * and asserts the skills pair lands in the dist with its log line.
 */
describe.skipIf(!existsSync(join(root, SKILLS_CLASSIFICATION_FILE)))(
  'deploy CLI stage command — skills wiring',
  () => {
    it('K7: `stage` stages the skills pair and reports it', () => {
      const dist = mkdtempSync(join(tmpdir(), 'deploy-cli-dist-'));
      try {
        const stdout = execFileSync(
          process.execPath,
          [
            '--import',
            'tsx',
            'packages/deploy/src/cli.ts',
            'stage',
            '--dist',
            dist,
            '--data',
            root,
          ],
          { cwd: root, encoding: 'utf8' },
        );
        expect(stdout).toContain('Skills-classification artifacts: staged');
        expect(existsSync(join(dist, STARS_FILE))).toBe(true);
        expect(existsSync(join(dist, SKILLS_CLASSIFICATION_FILE))).toBe(true);
        expect(existsSync(join(dist, SKILLS_CLASSIFICATION_META_FILE))).toBe(true);
      } finally {
        rmSync(dist, { recursive: true, force: true });
      }
    });
  },
);

/**
 * Round-11 finding, hardened round 12. A stager that DETECTED bad bytes and
 * could not remove them reported truthfully — and the CLI still exited 0, so
 * Pages uploaded the residue and a coherent meta rewrite was served. The CLI
 * now exits 4 on ANY stager's residue. Round-12 (sol): the original pin built
 * ONLY AI residue, so a mutant dropping `discovery.residue` from the CLI
 * condition passed — parametrize over EACH optional layer whose residue is
 * black-box constructible, so dropping any one of them from the condition
 * reddens its own case.
 *
 * Skills is deliberately NOT here: its transactional stager (token-randomized
 * temps/backups, ordered commit) cleans up robustly, so an unremovable-residue
 * state is not reachable by pre-placing a directory from outside — the residue
 * branches are pinned directly instead (skills-stage F1-HONEST /
 * F1-DISCARD-HONEST assert `result.residue`). Recorded, not hidden.
 */
describe('deploy CLI stage command — residue escalation', () => {
  interface Layer {
    name: string;
    metaFile: string;
    write: (data: string) => void;
  }

  const AI: Layer = {
    name: 'AI',
    metaFile: 'ai-annotations-meta.json',
    write: (data) => {
      const annotations = '{"schema_version":"1.0","taxonomy_version":"1","annotations":[]}';
      writeFileSync(join(data, 'ai-annotations.json'), annotations);
      writeFileSync(
        join(data, 'ai-annotations-meta.json'),
        JSON.stringify({
          schema_version: '1.0',
          annotations_sha256: createHash('sha256').update(annotations, 'utf8').digest('hex'),
          annotation_count: 0,
          taxonomy_version: '1',
          dataset_sha256: '0'.repeat(64),
          generated_at: '2026-06-20T00:00:00Z',
        }),
      );
    },
  };

  const DISCOVERY: Layer = {
    name: 'discovery',
    metaFile: 'discovery-candidates-meta.json',
    write: (data) => {
      const source = {
        kind: 'manual',
        source_id: 'owner/repo',
        source_url: 'https://github.com/owner/repo',
        observed_at: '2026-01-15T00:00:00.000Z',
      };
      const candidates = JSON.stringify({
        schema_version: 1,
        candidates: [
          {
            node_id: 'R_1',
            owner: 'owner',
            name: 'repo',
            full_name: 'owner/repo',
            html_url: 'https://github.com/owner/repo',
            description: 'A test repo',
            homepage_url: null,
            primary_language: 'TypeScript',
            stargazer_count: 100,
            archived: false,
            disabled: false,
            fork: false,
            pushed_at: '2026-01-01T00:00:00.000Z',
            discovered_at: '2026-01-15T00:00:00.000Z',
            first_seen_source: source,
            sources: [source],
            status: 'candidate',
          },
        ],
      });
      writeFileSync(join(data, 'discovery-candidates.json'), candidates);
      writeFileSync(
        join(data, 'discovery-candidates-meta.json'),
        JSON.stringify({
          schema_version: 1,
          generated_at: '2026-01-15T00:00:00.000Z',
          dataset_sha: createHash('sha256').update(candidates, 'utf8').digest('hex'),
          candidate_count: 1,
          source_count: 1,
          generator_version: '0.1.0',
        }),
      );
    },
  };

  it.each([AI, DISCOVERY])(
    'RESIDUE-EXIT ($name): unremovable rejected residue fails the deploy (exit 4)',
    (layer) => {
      const dist = mkdtempSync(join(tmpdir(), 'deploy-cli-residue-dist-'));
      const data = mkdtempSync(join(tmpdir(), 'deploy-cli-residue-data-'));
      try {
        execFileSync(
          process.execPath,
          ['--import', 'tsx', 'packages/deploy/src/cli.ts', 'fixture', '--out', data],
          { cwd: root, encoding: 'utf8' },
        );
        layer.write(data);
        // A DIRECTORY squats on the dist meta path: the meta write throws, the
        // artifact half is discarded, the directory cannot be (non-empty
        // rmSync without recursive) — an unremovable-residue result.
        mkdirSync(join(dist, layer.metaFile), { recursive: true });
        let status = 0;
        let output = '';
        try {
          output = execFileSync(
            process.execPath,
            [
              '--import',
              'tsx',
              'packages/deploy/src/cli.ts',
              'stage',
              '--dist',
              dist,
              '--data',
              data,
            ],
            { cwd: root, encoding: 'utf8' },
          );
        } catch (error) {
          const e = error as { status?: number; stdout?: string; stderr?: string };
          status = e.status ?? -1;
          output = `${e.stdout ?? ''}${e.stderr ?? ''}`;
        }
        expect(output).toContain('could NOT all be removed');
        expect(output).toContain('refusing to let this dist ship');
        expect(status).toBe(4);
      } finally {
        rmSync(dist, { recursive: true, force: true });
        rmSync(data, { recursive: true, force: true });
      }
    },
  );
});
