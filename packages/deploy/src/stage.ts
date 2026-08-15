import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  copyFileSync,
  existsSync,
  lstatSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { AiAnnotationsMetaSchema, AiAnnotationsSchema } from '@starred/ai-schema';
import {
  DiscoveryCandidatesFileSchema,
  DiscoveryCandidatesMetaSchema,
} from '@starred/discovery/contracts';
import {
  SkillsClassificationMetaSchema,
  SkillsClassificationSchema,
  checkSkillsMetaConsistency,
} from '@starred/skills-schema/contracts';
import { sha256Hex, verifyDatasetIntegrity } from './dataset';

export const STARS_FILE = 'stars.json';
export const DATASET_META_FILE = 'dataset-meta.json';
export const AI_ANNOTATIONS_FILE = 'ai-annotations.json';
export const AI_ANNOTATIONS_META_FILE = 'ai-annotations-meta.json';
export const DISCOVERY_CANDIDATES_FILE = 'discovery-candidates.json';
export const DISCOVERY_CANDIDATES_META_FILE = 'discovery-candidates-meta.json';
export const SKILLS_CLASSIFICATION_FILE = 'skills-classification.json';
export const SKILLS_CLASSIFICATION_META_FILE = 'skills-classification-meta.json';

/** Files that must never reach the public Pages artifact (telemetry / secrets). */
export const FORBIDDEN_IN_DIST = ['run-meta.json', 'config.yaml', '.env'] as const;

export interface StageOptions {
  /** Directory holding the canonical stars.json + dataset-meta.json (repo root). */
  dataDir: string;
  /** The built dashboard output directory to stage data INTO. */
  distDir: string;
}

export interface StageResult {
  repoCount: number;
  sha256: string;
}

export function assertNoForbiddenFiles(distDir: string): void {
  for (const name of FORBIDDEN_IN_DIST) {
    if (existsSync(resolve(distDir, name))) {
      throw new Error(`forbidden file present in Pages artifact: ${name}`);
    }
  }
}

/**
 * Stage the canonical data files into the built dist, AFTER verifying integrity.
 * The canonical files are only ever READ here, so a failure cannot corrupt them
 * (DEPLOY-3/DEPLOY-4); verification throws before any copy, so invalid data is
 * never staged. Refuses to proceed if a secret/telemetry file is in the dist
 * (BUILD-DATA-3).
 */
export function stageDashboardData(opts: StageOptions): StageResult {
  const { dataDir, distDir } = opts;
  if (!existsSync(distDir)) {
    throw new Error(`dist directory not found: ${distDir} (build the dashboard first)`);
  }
  const starsPath = resolve(dataDir, STARS_FILE);
  const metaPath = resolve(dataDir, DATASET_META_FILE);
  if (!existsSync(starsPath) || !existsSync(metaPath)) {
    throw new Error(
      `canonical data not found in ${dataDir} (expected ${STARS_FILE} + ${DATASET_META_FILE})`,
    );
  }

  const starsText = readFileSync(starsPath, 'utf8');
  const metaText = readFileSync(metaPath, 'utf8');
  const verified = verifyDatasetIntegrity(starsText, metaText); // throws BEFORE any copy
  assertNoForbiddenFiles(distDir); // never ship secrets/telemetry, even if the build emitted them

  copyFileSync(starsPath, resolve(distDir, STARS_FILE));
  copyFileSync(metaPath, resolve(distDir, DATASET_META_FILE));

  return { repoCount: verified.meta.repo_count, sha256: verified.sha256 };
}

export interface AiStageResult {
  staged: boolean;
  reason?: string;
}

/**
 * Stage the OPTIONAL AI artifacts into the dist, FAIL-SOFT: a missing, malformed,
 * or hash-mismatched pair is skipped (never throws), so an AI problem can never
 * block the canonical Pages deployment. The dashboard validates again at runtime.
 */
export function stageAiArtifacts(opts: StageOptions): AiStageResult {
  const annPath = resolve(opts.dataDir, AI_ANNOTATIONS_FILE);
  const metaPath = resolve(opts.dataDir, AI_ANNOTATIONS_META_FILE);
  if (!existsSync(annPath) || !existsSync(metaPath)) {
    return { staged: false, reason: 'no AI artifacts present' };
  }
  try {
    const annText = readFileSync(annPath, 'utf8');
    const metaText = readFileSync(metaPath, 'utf8');
    const annotations = AiAnnotationsSchema.parse(JSON.parse(annText));
    const meta = AiAnnotationsMetaSchema.parse(JSON.parse(metaText));
    if (meta.annotations_sha256 !== sha256Hex(annText)) {
      return { staged: false, reason: 'AI artifact hash mismatch — skipped' };
    }
    if (meta.annotation_count !== annotations.annotations.length) {
      return { staged: false, reason: 'AI artifact count mismatch — skipped' };
    }
    if (meta.taxonomy_version !== annotations.taxonomy_version) {
      return { staged: false, reason: 'AI artifact taxonomy mismatch — skipped' };
    }
    copyFileSync(annPath, resolve(opts.distDir, AI_ANNOTATIONS_FILE));
    copyFileSync(metaPath, resolve(opts.distDir, AI_ANNOTATIONS_META_FILE));
    return { staged: true };
  } catch (error) {
    return { staged: false, reason: error instanceof Error ? error.message : 'AI staging skipped' };
  }
}

export interface DiscoveryStageResult {
  staged: boolean;
  reason?: string;
}

export interface SkillsStageResult {
  staged: boolean;
  reason?: string;
}

/** Seams for the F1/F4 regressions to inject failures and races at exact points. */
export interface SkillsStageHooks {
  /**
   * Invoked after validation, immediately BEFORE the snapshot bytes are written
   * to temporaries. This is where a source rewrite must be injected: an
   * implementation that re-opens the source at this point publishes the rewrite,
   * one that writes the validated buffers does not. Injecting any later would
   * pass against both, and pin nothing.
   */
  beforeStageWrite?: () => void;
  /** Invoked immediately before each `rename` of the commit section. */
  beforeCommitStep?: (step: 'artifact' | 'meta') => void;
}

/**
 * Stage the OPTIONAL M2 skills-classification artifacts into the dist,
 * FAIL-SOFT like AI/discovery (P7 §4.10): absent pair → skipped; incomplete
 * pair, schema violation, byte-hash mismatch, or a meta↔artifact
 * cross-invariant breach (C-1..C-4/A-1..A-3, stars-independent) → skipped
 * with the reason named; never throws, so a classification problem can never
 * block the canonical Pages deployment. The dashboard re-validates the same
 * contract at runtime. NOTE deliberately absent: any comparison of
 * `generated_against_stars_sha256` to the live dataset — provenance is not a
 * staging gate (§2.1).
 *
 * PUBLICATION IS TRANSACTIONAL (review findings F1/F4). The previous
 * copy-then-rename version lacked all three of these:
 *
 *   SNAPSHOT FIDELITY — each source file is read EXACTLY ONCE and every later
 *     step uses those same in-memory bytes. Re-opening the sources to copy them
 *     let a generator rewriting a file mid-stage publish bytes that were never
 *     validated, while still reporting success.
 *   SERIALIZATION — the commit section runs under an exclusive lock, so two
 *     concurrent stagers cannot interleave (A-artifact → B-artifact → B-meta →
 *     A-meta) into a mixed pair that both invocations call `staged: true`.
 *   ROLLBACK — a pre-existing pair is moved aside before the commit and put
 *     back if any step fails, so a failed re-stage leaves it byte-identical
 *     instead of half-replaced.
 *
 * `staged: true` therefore means BOTH files of this invocation's validated
 * snapshot are in place — never a mixed pair.
 *
 * Residual, deliberately not closed (review finding F2, owner-accepted): the
 * temporaries are exclusive-CREATED and their contents verified before use, but
 * `rename` still resolves by path, so an adversary who can write into the dist
 * directory retains a narrow window. Closing it needs fd-relative renames Node
 * does not expose; a glob/sweep "fix" is explicitly forbidden — that is how the
 * earlier foreign-file ownership defect entered.
 */
export function stageSkillsArtifacts(
  opts: StageOptions,
  hooks: SkillsStageHooks = {},
): SkillsStageResult {
  const artifactPath = resolve(opts.dataDir, SKILLS_CLASSIFICATION_FILE);
  const metaPath = resolve(opts.dataDir, SKILLS_CLASSIFICATION_META_FILE);
  if (!existsSync(artifactPath) && !existsSync(metaPath)) {
    return { staged: false, reason: 'no skills-classification artifacts present' };
  }
  if (!existsSync(artifactPath) || !existsSync(metaPath)) {
    return { staged: false, reason: 'incomplete skills-classification artifact pair — skipped' };
  }
  try {
    // A. READ ONCE. These buffers are the snapshot: validated below, published
    //    below, never re-read from disk in between.
    const artifactBytes = readFileSync(artifactPath);
    const metaBytes = readFileSync(metaPath);

    const artifact = SkillsClassificationSchema.parse(JSON.parse(artifactBytes.toString('utf8')));
    const meta = SkillsClassificationMetaSchema.parse(JSON.parse(metaBytes.toString('utf8')));
    // Hashed over the snapshot BYTES, matching how the digest was generated.
    if (meta.classification_sha256 !== createHash('sha256').update(artifactBytes).digest('hex')) {
      return { staged: false, reason: 'skills-classification hash mismatch — skipped' };
    }
    const problems = checkSkillsMetaConsistency(meta, artifact);
    if (problems.length > 0) {
      return {
        staged: false,
        reason: `skills-classification meta↔artifact mismatch — skipped (${problems[0]})`,
      };
    }

    const distArtifact = resolve(opts.distDir, SKILLS_CLASSIFICATION_FILE);
    const distMeta = resolve(opts.distDir, SKILLS_CLASSIFICATION_META_FILE);
    const lockPath = resolve(opts.distDir, `${SKILLS_CLASSIFICATION_FILE}.stage-lock`);

    // B. SERIALIZE. Exclusive create IS the lock; a concurrent stager is turned
    //    away with a named reason rather than allowed to interleave. Skipping
    //    is the fail-soft outcome — the deploy is never blocked.
    let lockFd: number;
    try {
      lockFd = openSync(lockPath, 'wx');
    } catch {
      return {
        staged: false,
        reason: 'skills-classification pair is being published by another stage — skipped',
      };
    }

    const token = randomUUID();
    const tmpArtifact = `${distArtifact}.${token}.staging-tmp`;
    const tmpMeta = `${distMeta}.${token}.staging-tmp`;
    const bakArtifact = `${distArtifact}.${token}.staging-bak`;
    const bakMeta = `${distMeta}.${token}.staging-bak`;
    /** Only paths THIS invocation created are ever removed. */
    const created: string[] = [];
    const discard = (path: string): void => {
      try {
        rmSync(path, { force: true });
      } catch {
        /* cleanup must never escalate an abort */
      }
    };

    try {
      // Destination shape is re-checked INSIDE the lock: a plan-time check
      // would already be stale by the time the commit section runs.
      for (const destination of [distArtifact, distMeta]) {
        if (existsSync(destination) && lstatSync(destination).isDirectory()) {
          throw new Error(`destination is a directory: ${destination}`);
        }
      }

      // Write the VALIDATED bytes (not a re-read of the source), exclusively,
      // then read back to prove what landed is what was validated.
      hooks.beforeStageWrite?.();
      writeFileSync(tmpArtifact, artifactBytes, { flag: 'wx' });
      created.push(tmpArtifact);
      writeFileSync(tmpMeta, metaBytes, { flag: 'wx' });
      created.push(tmpMeta);
      if (
        !readFileSync(tmpArtifact).equals(artifactBytes) ||
        !readFileSync(tmpMeta).equals(metaBytes)
      ) {
        throw new Error('staged temporary does not match the validated snapshot');
      }

      // C. Move any pre-existing pair aside so it can be restored intact.
      const hadArtifact = existsSync(distArtifact);
      const hadMeta = existsSync(distMeta);
      if (hadArtifact) renameSync(distArtifact, bakArtifact);
      if (hadMeta) renameSync(distMeta, bakMeta);

      try {
        hooks.beforeCommitStep?.('artifact');
        renameSync(tmpArtifact, distArtifact);
        hooks.beforeCommitStep?.('meta');
        renameSync(tmpMeta, distMeta);
      } catch (commitError) {
        // Undo this invocation's partial commit, then restore the old pair.
        discard(distArtifact);
        discard(distMeta);
        if (hadArtifact) renameSync(bakArtifact, distArtifact);
        if (hadMeta) renameSync(bakMeta, distMeta);
        throw commitError;
      }

      discard(bakArtifact);
      discard(bakMeta);
      return { staged: true };
    } catch (stageError) {
      for (const path of created) discard(path);
      return {
        staged: false,
        reason: `skills-classification staging aborted, any pre-existing pair restored — ${
          stageError instanceof Error ? stageError.message : 'staging failed'
        }`,
      };
    } finally {
      try {
        closeSync(lockFd);
      } catch {
        /* the lock file is removed regardless */
      }
      discard(lockPath);
    }
  } catch (error) {
    return {
      staged: false,
      reason: error instanceof Error ? error.message : 'skills-classification staging skipped',
    };
  }
}

/**
 * Stage OPTIONAL Discovery Inbox artifacts into the dist, FAIL-SOFT like AI
 * artifacts. The dashboard performs the same schema/hash/count checks at
 * runtime, but Pages should only publish artifacts that are internally coherent.
 */
export function stageDiscoveryArtifacts(opts: StageOptions): DiscoveryStageResult {
  const candidatesPath = resolve(opts.dataDir, DISCOVERY_CANDIDATES_FILE);
  const metaPath = resolve(opts.dataDir, DISCOVERY_CANDIDATES_META_FILE);
  if (!existsSync(candidatesPath) && !existsSync(metaPath)) {
    return { staged: false, reason: 'no discovery artifacts present' };
  }
  if (!existsSync(candidatesPath) || !existsSync(metaPath)) {
    return { staged: false, reason: 'incomplete discovery artifact pair — skipped' };
  }

  try {
    const candidatesText = readFileSync(candidatesPath, 'utf8');
    const metaText = readFileSync(metaPath, 'utf8');
    const candidates = DiscoveryCandidatesFileSchema.parse(JSON.parse(candidatesText));
    const meta = DiscoveryCandidatesMetaSchema.parse(JSON.parse(metaText));
    if (meta.dataset_sha !== sha256Hex(candidatesText)) {
      return { staged: false, reason: 'discovery artifact hash mismatch — skipped' };
    }
    if (meta.candidate_count !== candidates.candidates.length) {
      return { staged: false, reason: 'discovery artifact count mismatch — skipped' };
    }
    copyFileSync(candidatesPath, resolve(opts.distDir, DISCOVERY_CANDIDATES_FILE));
    copyFileSync(metaPath, resolve(opts.distDir, DISCOVERY_CANDIDATES_META_FILE));
    return { staged: true };
  } catch (error) {
    return {
      staged: false,
      reason: error instanceof Error ? error.message : 'discovery staging skipped',
    };
  }
}
