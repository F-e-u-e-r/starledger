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
 * Round-11 finding (luna@ultra): a stager that DETECTED bad bytes and could
 * not remove them reported truthfully — and the CLI still exited 0, so Pages
 * uploaded the residue, and a coherent meta rewrite was then served. Absence
 * and invalid sources stay fail-soft; UNREMOVABLE REJECTED RESIDUE is a
 * dist-integrity failure and must fail the deploy (exit 4), which pages.yml's
 * `bash -e` turns into "nothing ships".
 */
describe('deploy CLI stage command — residue escalation', () => {
  it('RESIDUE-EXIT: unremovable rejected optional-pair residue fails the deploy', () => {
    const dist = mkdtempSync(join(tmpdir(), 'deploy-cli-residue-dist-'));
    const data = mkdtempSync(join(tmpdir(), 'deploy-cli-residue-data-'));
    try {
      execFileSync(
        process.execPath,
        ['--import', 'tsx', 'packages/deploy/src/cli.ts', 'fixture', '--out', data],
        { cwd: root, encoding: 'utf8' },
      );
      // A valid AI pair in the sources…
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
      // …and a DIRECTORY squatting on the dist meta path: the meta write
      // throws, the artifact half is discarded, the directory cannot be — an
      // unremovable-residue result.
      mkdirSync(join(dist, 'ai-annotations-meta.json'), { recursive: true });
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
  });
});
