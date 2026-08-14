import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  serializeSkillsClassification,
  serializeSkillsClassificationMeta,
  type SkillsClassificationMeta,
} from '@starred/skills-schema';
import { describe, expect, it } from 'vitest';
import {
  SKILLS_CLASSIFICATION_FILE,
  SKILLS_CLASSIFICATION_META_FILE,
  stageSkillsArtifacts,
} from '../src/stage';

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function validPair(summary = 'Stage fixture entry.'): { artifact: string; meta: string } {
  const artifact = serializeSkillsClassification({
    scope: {
      id: 'coding-agent-skills-ecosystem',
      label: 'Coding-agent skills ecosystem',
      description: 'A curated subset; absence is not a classification.',
    },
    categories: [
      {
        id: 'verification-qa',
        label: 'Verification & QA',
        kind: 'domain',
        definition: 'Correctness-checking skills.',
        order: 0,
        target_pack: 'opus-pack',
      },
    ],
    entries: [
      {
        source_name_with_owner: 'alpha/one',
        node_id: 'R_kgDOstage001',
        resolution: 'resolved',
        primary_category_id: 'verification-qa',
        secondary_category_ids: [],
        summary,
      },
    ],
  });
  const meta: SkillsClassificationMeta = {
    schema_version: '1.0',
    taxonomy_version: 'skills-1',
    classification_sha256: sha256(artifact),
    source_sha256: 'b'.repeat(64),
    aliases_sha256: null,
    prior_classification_sha256: null,
    generated_against_stars_sha256: 'c'.repeat(64),
    generated_at: '2026-08-14T00:00:00Z',
    category_count: 1,
    source_entry_count: 1,
    resolved_entry_count: 1,
    present_repo_count: 1,
    absent_repo_count: 0,
    unresolved_entry_count: 0,
    canonical_repo_count: 700,
    unclassified_repo_count: 699,
  };
  return { artifact, meta: serializeSkillsClassificationMeta(meta) };
}

function dirs(): { dataDir: string; distDir: string } {
  return {
    dataDir: mkdtempSync(join(tmpdir(), 'skills-stage-data-')),
    distDir: mkdtempSync(join(tmpdir(), 'skills-stage-dist-')),
  };
}

describe('skills-classification staging (fail-soft publication, P7 §4.10)', () => {
  it('stages a valid pair into the dist', () => {
    const { dataDir, distDir } = dirs();
    const pair = validPair();
    writeFileSync(join(dataDir, SKILLS_CLASSIFICATION_FILE), pair.artifact);
    writeFileSync(join(dataDir, SKILLS_CLASSIFICATION_META_FILE), pair.meta);
    const result = stageSkillsArtifacts({ dataDir, distDir });
    expect(result).toEqual({ staged: true });
    expect(existsSync(join(distDir, SKILLS_CLASSIFICATION_FILE))).toBe(true);
    expect(existsSync(join(distDir, SKILLS_CLASSIFICATION_META_FILE))).toBe(true);
  });

  it('is fail-soft when both artifacts are absent (canonical deploy proceeds)', () => {
    const { dataDir, distDir } = dirs();
    const result = stageSkillsArtifacts({ dataDir, distDir });
    expect(result.staged).toBe(false);
    expect(result.reason).toContain('no skills-classification artifacts');
  });

  it('skips an incomplete pair without staging either file', () => {
    const { dataDir, distDir } = dirs();
    writeFileSync(join(dataDir, SKILLS_CLASSIFICATION_FILE), validPair().artifact);
    const result = stageSkillsArtifacts({ dataDir, distDir });
    expect(result.staged).toBe(false);
    expect(result.reason).toContain('incomplete');
    expect(existsSync(join(distDir, SKILLS_CLASSIFICATION_FILE))).toBe(false);
  });

  it('skips on byte-hash mismatch', () => {
    const { dataDir, distDir } = dirs();
    const pair = validPair();
    writeFileSync(
      join(dataDir, SKILLS_CLASSIFICATION_FILE),
      pair.artifact.replace('Stage fixture entry.', 'Tampered fixture entry.'),
    );
    writeFileSync(join(dataDir, SKILLS_CLASSIFICATION_META_FILE), pair.meta);
    const result = stageSkillsArtifacts({ dataDir, distDir });
    expect(result.staged).toBe(false);
    expect(result.reason).toContain('hash mismatch');
    expect(existsSync(join(distDir, SKILLS_CLASSIFICATION_FILE))).toBe(false);
  });

  it('skips on a schema violation (whole pair, no partial staging)', () => {
    const { dataDir, distDir } = dirs();
    const pair = validPair();
    writeFileSync(join(dataDir, SKILLS_CLASSIFICATION_FILE), '{"schema_version":"9.9"}');
    writeFileSync(join(dataDir, SKILLS_CLASSIFICATION_META_FILE), pair.meta);
    const result = stageSkillsArtifacts({ dataDir, distDir });
    expect(result.staged).toBe(false);
    expect(existsSync(join(distDir, SKILLS_CLASSIFICATION_META_FILE))).toBe(false);
  });

  it('K5: a blocked destination aborts with the dist untouched — never a partial pair, no temp residue', () => {
    const { dataDir, distDir } = dirs();
    const pair = validPair();
    writeFileSync(join(dataDir, SKILLS_CLASSIFICATION_FILE), pair.artifact);
    writeFileSync(join(dataDir, SKILLS_CLASSIFICATION_META_FILE), pair.meta);
    mkdirSync(join(distDir, SKILLS_CLASSIFICATION_META_FILE));
    const result = stageSkillsArtifacts({ dataDir, distDir });
    expect(result.staged).toBe(false);
    expect(result.reason).toContain('destinations untouched');
    expect(existsSync(join(distDir, SKILLS_CLASSIFICATION_FILE))).toBe(false);
    expect(readdirSync(distDir).filter((name) => name.includes('.staging-tmp'))).toEqual([]);
  });

  it('L1: a valid re-stage onto a BLOCKED destination leaves the old artifact byte-identical (discriminating pin)', () => {
    const { dataDir, distDir } = dirs();
    const oldPair = validPair();
    const newPair = validPair('Different summary for the new pair.');
    // A previously staged artifact lives in the dist; its meta destination is
    // now occupied by a directory (the injected STAGING-phase failure — the
    // §4.10 pre-check catches it after both temp copies succeeded).
    writeFileSync(join(distDir, SKILLS_CLASSIFICATION_FILE), oldPair.artifact);
    mkdirSync(join(distDir, SKILLS_CLASSIFICATION_META_FILE));
    // The NEW pair is fully valid — validation passes, so the failure cannot
    // hide in the read/parse phase (the R3 finding against the earlier pin).
    // The round-2 destructive implementation copies the new artifact STRAIGHT
    // over the old one before its meta copy fails (EISDIR on the directory),
    // then rmSync-deletes it — either way the old bytes are gone and this
    // test fails on it. The temp-file implementation aborts with every
    // destination untouched.
    writeFileSync(join(dataDir, SKILLS_CLASSIFICATION_FILE), newPair.artifact);
    writeFileSync(join(dataDir, SKILLS_CLASSIFICATION_META_FILE), newPair.meta);
    const result = stageSkillsArtifacts({ dataDir, distDir });
    expect(result.staged).toBe(false);
    expect(result.reason).toContain('destinations untouched');
    expect(readFileSync(join(distDir, SKILLS_CLASSIFICATION_FILE), 'utf8')).toBe(oldPair.artifact);
    expect(readdirSync(distDir).filter((name) => name.includes('.staging-tmp'))).toEqual([]);
  });

  it('R4: a FOREIGN regular file at a .staging-tmp-suffixed path survives both a successful stage and an abort', () => {
    const foreignName = `${SKILLS_CLASSIFICATION_META_FILE}.staging-tmp`;
    // Successful stage: the unique-token temporaries never collide with the
    // foreign file, and cleanup touches only what this invocation created.
    {
      const { dataDir, distDir } = dirs();
      const pair = validPair();
      writeFileSync(join(dataDir, SKILLS_CLASSIFICATION_FILE), pair.artifact);
      writeFileSync(join(dataDir, SKILLS_CLASSIFICATION_META_FILE), pair.meta);
      writeFileSync(join(distDir, foreignName), 'foreign bytes');
      const result = stageSkillsArtifacts({ dataDir, distDir });
      expect(result.staged).toBe(true);
      expect(readFileSync(join(distDir, foreignName), 'utf8')).toBe('foreign bytes');
    }
    // Aborted stage (blocked destination): the foreign file still survives.
    {
      const { dataDir, distDir } = dirs();
      const pair = validPair();
      writeFileSync(join(dataDir, SKILLS_CLASSIFICATION_FILE), pair.artifact);
      writeFileSync(join(dataDir, SKILLS_CLASSIFICATION_META_FILE), pair.meta);
      writeFileSync(join(distDir, foreignName), 'foreign bytes');
      mkdirSync(join(distDir, SKILLS_CLASSIFICATION_META_FILE));
      const result = stageSkillsArtifacts({ dataDir, distDir });
      expect(result.staged).toBe(false);
      expect(readFileSync(join(distDir, foreignName), 'utf8')).toBe('foreign bytes');
    }
  });

  it('skips on a meta↔artifact cross-invariant breach, naming the check', () => {
    const { dataDir, distDir } = dirs();
    const pair = validPair();
    const badMeta = pair.meta
      .replace('"category_count": 1', '"category_count": 2')
      .replace('"source_entry_count": 1', '"source_entry_count": 2')
      .replace('"resolved_entry_count": 1', '"resolved_entry_count": 2')
      .replace('"present_repo_count": 1', '"present_repo_count": 2')
      .replace('"unclassified_repo_count": 699', '"unclassified_repo_count": 698');
    writeFileSync(join(dataDir, SKILLS_CLASSIFICATION_FILE), pair.artifact);
    writeFileSync(join(dataDir, SKILLS_CLASSIFICATION_META_FILE), badMeta);
    const result = stageSkillsArtifacts({ dataDir, distDir });
    expect(result.staged).toBe(false);
    expect(result.reason).toContain('meta↔artifact mismatch');
    expect(result.reason).toContain('C-1');
  });
});
