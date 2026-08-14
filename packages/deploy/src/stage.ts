import { randomUUID } from 'node:crypto';
import {
  constants as fsConstants,
  copyFileSync,
  existsSync,
  lstatSync,
  readFileSync,
  renameSync,
  rmSync,
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
 */
export function stageSkillsArtifacts(opts: StageOptions): SkillsStageResult {
  const artifactPath = resolve(opts.dataDir, SKILLS_CLASSIFICATION_FILE);
  const metaPath = resolve(opts.dataDir, SKILLS_CLASSIFICATION_META_FILE);
  if (!existsSync(artifactPath) && !existsSync(metaPath)) {
    return { staged: false, reason: 'no skills-classification artifacts present' };
  }
  if (!existsSync(artifactPath) || !existsSync(metaPath)) {
    return { staged: false, reason: 'incomplete skills-classification artifact pair — skipped' };
  }
  try {
    const artifactText = readFileSync(artifactPath, 'utf8');
    const metaText = readFileSync(metaPath, 'utf8');
    const artifact = SkillsClassificationSchema.parse(JSON.parse(artifactText));
    const meta = SkillsClassificationMetaSchema.parse(JSON.parse(metaText));
    if (meta.classification_sha256 !== sha256Hex(artifactText)) {
      return { staged: false, reason: 'skills-classification hash mismatch — skipped' };
    }
    const problems = checkSkillsMetaConsistency(meta, artifact);
    if (problems.length > 0) {
      return {
        staged: false,
        reason: `skills-classification meta↔artifact mismatch — skipped (${problems[0]})`,
      };
    }
    // Stage as a pair or not at all (review findings K5 + L1), WITHOUT ever
    // damaging a pre-existing dist pair: copy both files to temporaries first
    // (the failure-prone step — space, permissions, source — happens in
    // isolation), pre-check that neither destination is a directory (the one
    // realistic rename failure), then rename into place. A copy failure only
    // cleans OUR temporaries; existing destination files are never touched.
    const distArtifact = resolve(opts.distDir, SKILLS_CLASSIFICATION_FILE);
    const distMeta = resolve(opts.distDir, SKILLS_CLASSIFICATION_META_FILE);
    // Ownership-safe temporaries (R4 finding): a unique per-invocation token
    // makes a name collision with anything foreign practically impossible,
    // COPYFILE_EXCL makes even that collision a refusal instead of an
    // overwrite, and cleanup touches ONLY the paths this invocation actually
    // created — never a foreign occupant, file or directory.
    const stagingToken = randomUUID();
    const tmpArtifact = `${distArtifact}.${stagingToken}.staging-tmp`;
    const tmpMeta = `${distMeta}.${stagingToken}.staging-tmp`;
    const createdTemporaries: string[] = [];
    const cleanupCreated = (): void => {
      for (const temporary of createdTemporaries) {
        try {
          rmSync(temporary, { force: true });
        } catch {
          /* never let cleanup escalate an abort */
        }
      }
    };
    try {
      copyFileSync(artifactPath, tmpArtifact, fsConstants.COPYFILE_EXCL);
      createdTemporaries.push(tmpArtifact);
      copyFileSync(metaPath, tmpMeta, fsConstants.COPYFILE_EXCL);
      createdTemporaries.push(tmpMeta);
      for (const destination of [distArtifact, distMeta]) {
        if (existsSync(destination) && lstatSync(destination).isDirectory()) {
          throw new Error(`destination is a directory: ${destination}`);
        }
      }
    } catch (stageError) {
      cleanupCreated();
      return {
        staged: false,
        reason: `skills-classification staging aborted, destinations untouched — ${
          stageError instanceof Error ? stageError.message : 'copy failed'
        }`,
      };
    }
    try {
      renameSync(tmpArtifact, distArtifact);
      renameSync(tmpMeta, distMeta);
    } catch (renameError) {
      // The same-directory rename window: after the pre-checks the realistic
      // failure class is exhausted, but stay honest if the fs still objects.
      cleanupCreated();
      return {
        staged: false,
        reason: `skills-classification staging failed mid-rename — dist may hold a mixed pair; rerun stage (${
          renameError instanceof Error ? renameError.message : 'rename failed'
        })`,
      };
    }
    return { staged: true };
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
