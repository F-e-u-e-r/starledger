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
    expect(result.reason).toContain('pre-existing pair restored');
    expect(existsSync(join(distDir, SKILLS_CLASSIFICATION_FILE))).toBe(false);
    // Every residue class this invocation can create: temporaries, the
    // rollback backups, and the publication lock.
    expect(
      readdirSync(distDir).filter(
        (name) =>
          name.includes('.staging-tmp') ||
          name.includes('.staging-bak') ||
          name.includes('.stage-lock'),
      ),
    ).toEqual([]);
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
    // test fails on it.
    //
    // SCOPE OF THIS PIN, stated honestly (re-review finding): it discriminates
    // the ROUND-2 destructive implementation, and nothing newer. Every
    // temp-file-based version — including the one that later proved to lose the
    // old artifact when a MOVE-ASIDE failed — passes this scenario, because the
    // directory destination is rejected before anything is moved. Do not read a
    // green L1 as evidence that rollback works; that guarantee belongs to
    // F1-ROLLBACK and F1-MOVEASIDE, each proven by deleting the mechanism it
    // guards.
    writeFileSync(join(dataDir, SKILLS_CLASSIFICATION_FILE), newPair.artifact);
    writeFileSync(join(dataDir, SKILLS_CLASSIFICATION_META_FILE), newPair.meta);
    const result = stageSkillsArtifacts({ dataDir, distDir });
    expect(result.staged).toBe(false);
    expect(result.reason).toContain('pre-existing pair restored');
    expect(readFileSync(join(distDir, SKILLS_CLASSIFICATION_FILE), 'utf8')).toBe(oldPair.artifact);
    // Every residue class this invocation can create: temporaries, the
    // rollback backups, and the publication lock.
    expect(
      readdirSync(distDir).filter(
        (name) =>
          name.includes('.staging-tmp') ||
          name.includes('.staging-bak') ||
          name.includes('.stage-lock'),
      ),
    ).toEqual([]);
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

  /**
   * F1 — the commit section is transactional. Before the rewrite the two
   * renames ran back to back: a failure of the SECOND one left the new artifact
   * beside the old meta, the function returned `staged: false` while admitting
   * "dist may hold a mixed pair", and the CLI published it anyway.
   */
  it('F1-ROLLBACK: a failure at the second commit step leaves the OLD pair byte-identical', () => {
    const { dataDir, distDir } = dirs();
    const oldPair = validPair('Old published entry.');
    writeFileSync(join(distDir, SKILLS_CLASSIFICATION_FILE), oldPair.artifact);
    writeFileSync(join(distDir, SKILLS_CLASSIFICATION_META_FILE), oldPair.meta);

    const newPair = validPair('New candidate entry.');
    writeFileSync(join(dataDir, SKILLS_CLASSIFICATION_FILE), newPair.artifact);
    writeFileSync(join(dataDir, SKILLS_CLASSIFICATION_META_FILE), newPair.meta);
    // Precondition: the two pairs really are different bytes, so "unchanged"
    // below cannot be satisfied trivially.
    expect(newPair.artifact).not.toBe(oldPair.artifact);

    const result = stageSkillsArtifacts(
      { dataDir, distDir },
      {
        beforeCommitStep: (step) => {
          if (step === 'meta') throw new Error('injected commit failure');
        },
      },
    );

    expect(result.staged).toBe(false);
    expect(readFileSync(join(distDir, SKILLS_CLASSIFICATION_FILE), 'utf8')).toBe(oldPair.artifact);
    expect(readFileSync(join(distDir, SKILLS_CLASSIFICATION_META_FILE), 'utf8')).toBe(oldPair.meta);
    expect(
      readdirSync(distDir).filter(
        (name) =>
          name.includes('.staging-tmp') ||
          name.includes('.staging-bak') ||
          name.includes('.stage-lock'),
      ),
    ).toEqual([]);
  });

  /**
   * F1 (re-review) — moving the old pair aside is itself a multi-step mutation.
   * An earlier amendment performed those two renames OUTSIDE the rollback
   * region, so a failure between them stranded the old artifact under its
   * backup name while the reason still claimed the pair had been restored.
   */
  it('F1-MOVEASIDE: a failure while moving the old pair aside leaves it byte-identical', () => {
    const { dataDir, distDir } = dirs();
    const oldPair = validPair('Old published entry.');
    writeFileSync(join(distDir, SKILLS_CLASSIFICATION_FILE), oldPair.artifact);
    writeFileSync(join(distDir, SKILLS_CLASSIFICATION_META_FILE), oldPair.meta);

    const newPair = validPair('New candidate entry.');
    writeFileSync(join(dataDir, SKILLS_CLASSIFICATION_FILE), newPair.artifact);
    writeFileSync(join(dataDir, SKILLS_CLASSIFICATION_META_FILE), newPair.meta);
    expect(newPair.artifact).not.toBe(oldPair.artifact);

    const result = stageSkillsArtifacts(
      { dataDir, distDir },
      {
        beforeMoveAside: (step) => {
          // Fail AFTER the artifact has been moved aside, BEFORE the meta is.
          if (step === 'meta') throw new Error('injected move-aside failure');
        },
      },
    );

    expect(result.staged).toBe(false);
    expect(result.reason).not.toContain('could NOT be fully restored');
    expect(readFileSync(join(distDir, SKILLS_CLASSIFICATION_FILE), 'utf8')).toBe(oldPair.artifact);
    expect(readFileSync(join(distDir, SKILLS_CLASSIFICATION_META_FILE), 'utf8')).toBe(oldPair.meta);
    expect(
      readdirSync(distDir).filter(
        (name) =>
          name.includes('.staging-tmp') ||
          name.includes('.staging-bak') ||
          name.includes('.stage-lock'),
      ),
    ).toEqual([]);
  });

  /**
   * F1 — publication is serialized. Driving a second stage from INSIDE the
   * first one's commit section is the interleaving the reviewers described
   * (A-artifact → B-artifact → B-meta → A-meta, both reporting success). The
   * lock must turn the inner invocation away, so the dist ends as one
   * self-consistent pair — never a mix of the two.
   */
  it('F1-SERIAL: a concurrent stage cannot interleave into a mixed pair', () => {
    const { dataDir, distDir } = dirs();
    const pairA = validPair('Stager A entry.');
    writeFileSync(join(dataDir, SKILLS_CLASSIFICATION_FILE), pairA.artifact);
    writeFileSync(join(dataDir, SKILLS_CLASSIFICATION_META_FILE), pairA.meta);

    const otherData = mkdtempSync(join(tmpdir(), 'skills-stage-data-b-'));
    const pairB = validPair('Stager B entry.');
    writeFileSync(join(otherData, SKILLS_CLASSIFICATION_FILE), pairB.artifact);
    writeFileSync(join(otherData, SKILLS_CLASSIFICATION_META_FILE), pairB.meta);
    expect(pairB.artifact).not.toBe(pairA.artifact);

    let inner: { staged: boolean; reason?: string } | null = null;
    const outer = stageSkillsArtifacts(
      { dataDir, distDir },
      {
        beforeCommitStep: (step) => {
          // Re-enter exactly between A's two commit steps.
          if (step === 'meta' && inner === null) {
            inner = stageSkillsArtifacts({ dataDir: otherData, distDir });
          }
        },
      },
    );

    expect(outer.staged).toBe(true);
    expect(inner).not.toBeNull();
    expect(inner!.staged).toBe(false);
    expect(inner!.reason).toContain('another stage');

    // The decisive assertion: the published pair is wholly A, never A/B or B/A.
    const publishedArtifact = readFileSync(join(distDir, SKILLS_CLASSIFICATION_FILE), 'utf8');
    const publishedMeta = readFileSync(join(distDir, SKILLS_CLASSIFICATION_META_FILE), 'utf8');
    expect(publishedArtifact).toBe(pairA.artifact);
    expect(publishedMeta).toBe(pairA.meta);
  });

  /**
   * F4 — the bytes published are the bytes validated. The source is read once;
   * re-opening it at copy time let a generator rewrite land unvalidated.
   *
   * WHAT THIS PIN DOES AND DOES NOT PROVE (re-review finding, recorded rather
   * than papered over). The injection point is a seam the implementation itself
   * invokes, so this test cannot bind an arbitrary implementation: one that
   * re-read both sources immediately BEFORE calling the seam would still pass,
   * and the pre-amendment code ignores the hooks argument entirely, so against
   * that exact predecessor this test passes vacuously. Its real evidentiary
   * weight comes from the mutation proof — replacing the validated-buffer write
   * with `copyFileSync` from the source turns it red — plus the seam-independent
   * read-back check in the implementation, which compares the staged temporary
   * against the validated buffer and so fails any path that publishes different
   * bytes. Treat those two as the guarantee; treat this test as the scenario.
   */
  it('F4-SNAPSHOT: a source rewritten mid-stage cannot reach the dist', () => {
    const { dataDir, distDir } = dirs();
    const validated = validPair('Validated snapshot entry.');
    writeFileSync(join(dataDir, SKILLS_CLASSIFICATION_FILE), validated.artifact);
    writeFileSync(join(dataDir, SKILLS_CLASSIFICATION_META_FILE), validated.meta);

    const sneaky = validPair('Rewritten after validation.');
    expect(sneaky.artifact).not.toBe(validated.artifact);

    const result = stageSkillsArtifacts(
      { dataDir, distDir },
      {
        // Injected BEFORE the staging write — the only point that discriminates.
        // An implementation re-opening the source here publishes the rewrite;
        // one writing the validated buffers ignores it. Injecting after the
        // write would pass against both and pin nothing.
        beforeStageWrite: () => {
          writeFileSync(join(dataDir, SKILLS_CLASSIFICATION_FILE), sneaky.artifact);
          writeFileSync(join(dataDir, SKILLS_CLASSIFICATION_META_FILE), sneaky.meta);
        },
      },
    );

    expect(result.staged).toBe(true);
    expect(readFileSync(join(distDir, SKILLS_CLASSIFICATION_FILE), 'utf8')).toBe(
      validated.artifact,
    );
    expect(readFileSync(join(distDir, SKILLS_CLASSIFICATION_META_FILE), 'utf8')).toBe(
      validated.meta,
    );
  });
});
