import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
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
import { verifyDatasetIntegrity } from './dataset';

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

  // BYTES, not decoded text: the digest is generated over the file's bytes,
  // and the runtime loader now verifies it that way too.
  const starsBytes = readFileSync(starsPath);
  const metaText = readFileSync(metaPath, 'utf8');
  const verified = verifyDatasetIntegrity(starsBytes, metaText); // throws BEFORE any publish
  assertNoForbiddenFiles(distDir); // never ship secrets/telemetry, even if the build emitted them

  // Publish the VALIDATED buffers. Re-opening the sources here would re-read
  // bytes nobody checked — a generator rewriting stars.json between validation
  // and publication would ship unvalidated data under the verified hash, and
  // for the CANONICAL dataset that is the base dashboard's ground truth.
  writeFileSync(resolve(distDir, STARS_FILE), starsBytes);
  writeFileSync(resolve(distDir, DATASET_META_FILE), Buffer.from(metaText, 'utf8'));

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
    // BYTES, read once. Build-side acceptance must agree with the runtime
    // loader's, which verifies the exact received bytes: hashing decoded text
    // here would accept an artifact the runtime then rejects, and the layer
    // would go unavailable after a deploy the build called sound.
    const annBytes = readFileSync(annPath);
    const metaBytes = readFileSync(metaPath);
    const annotations = AiAnnotationsSchema.parse(JSON.parse(annBytes.toString('utf8')));
    const meta = AiAnnotationsMetaSchema.parse(JSON.parse(metaBytes.toString('utf8')));
    if (meta.annotations_sha256 !== createHash('sha256').update(annBytes).digest('hex')) {
      return { staged: false, reason: 'AI artifact hash mismatch — skipped' };
    }
    if (meta.annotation_count !== annotations.annotations.length) {
      return { staged: false, reason: 'AI artifact count mismatch — skipped' };
    }
    if (meta.taxonomy_version !== annotations.taxonomy_version) {
      return { staged: false, reason: 'AI artifact taxonomy mismatch — skipped' };
    }
    // Publish the VALIDATED buffers, not a re-read of the sources: re-opening
    // them would let a generator rewrite between validation and publication
    // land unvalidated.
    writeFileSync(resolve(opts.distDir, AI_ANNOTATIONS_FILE), annBytes);
    writeFileSync(resolve(opts.distDir, AI_ANNOTATIONS_META_FILE), metaBytes);
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
  /**
   * Set when the publication itself is sound but the dist was left in a state
   * a later run must know about — currently only an unremovable lock file,
   * which would make every subsequent stage skip. Surfaced by the CLI: a
   * cleanup failure that silently disables future staging is exactly the kind
   * of degradation that must be visible.
   */
  warning?: string;
}

/**
 * The operator-facing lines for a skills staging result.
 *
 * Extracted as a pure function so the WARNING path is pinnable: a warning that
 * is produced but never printed is invisible, and a subprocess CLI test cannot
 * force a lock-removal failure from the outside.
 *
 * It returns ONE string rather than a list of lines, deliberately. A list gives
 * a caller an index to drop — a CLI printing only `[0]` would suppress every
 * real warning while the formatter's own tests stayed green (observed in
 * review). With a single value the caller can print it or not, and the existing
 * CLI test already fails if it does not.
 */
export function formatSkillsStageReport(result: SkillsStageResult): string {
  const head = `[deploy] Skills-classification artifacts: ${
    result.staged ? 'staged' : `skipped (${result.reason})`
  }`;
  return result.warning
    ? `${head}\n[deploy] WARNING skills-classification: ${result.warning}`
    : head;
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
  /**
   * Invoked after the snapshot bytes are written to temporaries and BEFORE they
   * are read back. This is the only point from which the read-back check —
   * which is what actually guarantees the published bytes are the validated
   * ones, independently of any seam — can be driven and therefore pinned.
   */
  afterStageWrite?: () => void;
  /**
   * Invoked immediately before each move-aside of a pre-existing destination.
   * Moving the old pair aside is a MULTI-STEP mutation of its own, so it needs
   * its own injection point: a failure between the two moves must still leave
   * the old pair intact.
   */
  beforeMoveAside?: (step: 'artifact' | 'meta') => void;
  /** Invoked immediately before each `rename` of the commit section. */
  beforeCommitStep?: (step: 'artifact' | 'meta') => void;
  /**
   * Injectable `lstat`, following the precedent set when the generator's
   * prior-artifact read needed an errno seam: a real filesystem cannot be made
   * to return `EIO`/`ESTALE` on demand, so the only way to pin "any errno other
   * than ENOENT aborts" is to inject it.
   */
  lstatImpl?: typeof lstatSync;
  /**
   * Injectable `open`, for the same reason as `lstatImpl`: a real filesystem
   * cannot be made to fail lock creation with `EACCES`/`ENOTDIR` on demand, so
   * "only EEXIST proves contention" is otherwise unpinnable.
   */
  openImpl?: typeof openSync;
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
 * BOUNDED, NOT CLOSED — crash atomicity. The guarantees above are
 * exception-safe, not crash-safe: POSIX offers no atomic rename of two
 * independent files, so a process killed between the two commit renames leaves
 * a new artifact beside no meta (plus the lock and backups), and no `finally`
 * can run to report or undo it. What bounds the consequence is the layer's own
 * design rather than this function: the runtime loader verifies the pair's
 * digest, so a torn pair fails soft to `unavailable` and the base browser is
 * unaffected, and the next stage skips with a NAMED stale-lock reason instead
 * of silently doing nothing. Closing it properly would mean publishing the pair
 * as one unit (a single file, or a directory swapped atomically) — an artifact
 * layout change, not a staging change, and out of this slice's scope.
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
  try {
    // Only ENOENT proves a source is absent. `existsSync` reports false for an
    // unreadable parent too, so the honest "nothing to stage" outcome and an
    // actionable EACCES/EIO would have been indistinguishable — the failure
    // would be reported as "no artifacts present" and quietly ignored forever.
    const sourceLstat = hooks.lstatImpl ?? lstatSync;
    const sourcePresent = (path: string): boolean => {
      try {
        sourceLstat(path);
        return true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return false;
        throw error;
      }
    };
    const hasArtifact = sourcePresent(artifactPath);
    const hasMeta = sourcePresent(metaPath);
    if (!hasArtifact && !hasMeta) {
      return { staged: false, reason: 'no skills-classification artifacts present' };
    }
    if (!hasArtifact || !hasMeta) {
      return { staged: false, reason: 'incomplete skills-classification artifact pair — skipped' };
    }
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
      lockFd = (hooks.openImpl ?? openSync)(lockPath, 'wx');
    } catch (lockError) {
      // Only EEXIST proves contention. Anything else (EACCES on a read-only
      // dist, ENOTDIR, EIO) is an actionable failure that must not be dressed
      // up as "someone else is publishing" — that reading sends an operator to
      // delete a lock file that was never the problem.
      if ((lockError as NodeJS.ErrnoException)?.code !== 'EEXIST') {
        return {
          staged: false,
          reason: `skills-classification staging could not acquire its lock — ${
            lockError instanceof Error ? lockError.message : 'lock creation failed'
          }`,
        };
      }
      return {
        staged: false,
        reason: `skills-classification pair is locked by another stage — skipped (if no stage is running, ${lockPath} is stale and can be removed)`,
      };
    }

    /** Only paths THIS invocation created are ever removed. */
    const created: string[] = [];
    /** Set when a rollback could not put the pre-existing pair back. */
    let restoreFailed = false;
    /** Set when this invocation's own published file could not be removed. */
    let publishedResidue = false;
    /** Set when the lock survives cleanup — every later stage would then skip. */
    let lockStuck = false;
    let result: SkillsStageResult;
    /** Removal that REPORTS its outcome; the caller decides whether it matters. */
    const discardOk = (path: string): boolean => {
      try {
        rmSync(path, { force: true });
        return true;
      } catch {
        return false;
      }
    };
    const discard = (path: string): void => {
      discardOk(path); // best-effort; used only where failure is truly inert
    };
    /**
     * True when a directory ENTRY exists at `path`, symlinks included.
     *
     * `existsSync` resolves the target, so it reports FALSE for a dangling
     * symlink even though the entry is really there — which would leave that
     * entry out of the rollback ledger and let the commit destroy it
     * unrecorded (probed: existsSync false, lstat succeeds, rename over it
     * succeeds).
     *
     * ONLY `ENOENT` proves absence. A catch-all would read a transient `EIO`
     * or `ESTALE` as "nothing there", drop a real file from the ledger and lose
     * it on rollback while still reporting a restore — the same fail-open shape
     * this repo already fixed once in the generator's prior-artifact read. Any
     * other errno therefore aborts staging before anything is touched.
     */
    try {
      // EVERYTHING between acquiring the lock and installing its `finally`
      // lives in here, including the `hooks.lstatImpl` property READ — a
      // throwing accessor there previously escaped and leaked the lock,
      // reintroducing a window this function had already closed once.
      const lstat = hooks.lstatImpl ?? lstatSync;
      const entryExists = (path: string): boolean => {
        try {
          lstat(path);
          return true;
        } catch (error) {
          if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return false;
          throw error;
        }
      };
      const token = randomUUID();
      const tmpArtifact = `${distArtifact}.${token}.staging-tmp`;
      const tmpMeta = `${distMeta}.${token}.staging-tmp`;
      const bakArtifact = `${distArtifact}.${token}.staging-bak`;
      const bakMeta = `${distMeta}.${token}.staging-bak`;

      // Destination shape is re-checked INSIDE the lock: a plan-time check
      // would already be stale by the time the commit section runs.
      for (const destination of [distArtifact, distMeta]) {
        if (entryExists(destination) && lstatSync(destination).isDirectory()) {
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
      hooks.afterStageWrite?.();
      if (
        !readFileSync(tmpArtifact).equals(artifactBytes) ||
        !readFileSync(tmpMeta).equals(metaBytes)
      ) {
        throw new Error('staged temporary does not match the validated snapshot');
      }

      // C. PUBLISH UNDER ROLLBACK. Moving the old pair aside is itself part of
      //    the protected region: an earlier version left those two renames
      //    outside it, so a failure BETWEEN them stranded the old artifact
      //    under its backup name while the reason still claimed a restore.
      //
      //    Two ledgers make the undo exact. `movedAside` records what to put
      //    back; `published` records the destinations THIS invocation actually
      //    wrote — and only those are ever removed. Discarding destinations
      //    unconditionally would delete a pre-existing file that is still in
      //    place when the FIRST move-aside is what failed.
      const movedAside: Array<[backup: string, destination: string]> = [];
      const published: string[] = [];
      let committed = false;
      try {
        hooks.beforeMoveAside?.('artifact');
        if (entryExists(distArtifact)) {
          renameSync(distArtifact, bakArtifact);
          movedAside.push([bakArtifact, distArtifact]);
        }
        hooks.beforeMoveAside?.('meta');
        if (entryExists(distMeta)) {
          renameSync(distMeta, bakMeta);
          movedAside.push([bakMeta, distMeta]);
        }
        hooks.beforeCommitStep?.('artifact');
        renameSync(tmpArtifact, distArtifact);
        published.push(distArtifact);
        hooks.beforeCommitStep?.('meta');
        renameSync(tmpMeta, distMeta);
        published.push(distMeta);
        committed = true;
      } finally {
        if (!committed) {
          // Removing what WE published is part of the undo, not inert cleanup:
          // a failure here leaves a partial canonical artifact behind, so it
          // must reach the reason rather than be swallowed.
          for (const destination of published) {
            // Distinct from a failed RESTORE: here our own file is stuck in
            // place. Reporting it as "could not restore the pre-existing pair"
            // would send an operator hunting for backups that never existed.
            if (!discardOk(destination)) publishedResidue = true;
          }
          for (const [backup, destination] of movedAside.reverse()) {
            try {
              renameSync(backup, destination);
            } catch {
              // Report it rather than pretend; the reason below stops claiming
              // a restore that did not happen.
              restoreFailed = true;
            }
          }
        }
      }

      // Only reached on a committed publication — a failure above propagates
      // out of the `finally` to the abort handler below.
      //
      // Remove ONLY the backups this invocation actually made. Discarding both
      // derived `.staging-bak` paths unconditionally deletes a foreign file
      // that merely happens to sit at one of them — the very ownership defect
      // the ledger exists to prevent, reintroduced on the success path.
      for (const [backup] of movedAside) discard(backup);
      result = { staged: true };
    } catch (stageError) {
      for (const path of created) discard(path);
      const detail = stageError instanceof Error ? stageError.message : 'staging failed';
      // Never claim a restore that did not happen (acceptance item D).
      // BOTH can be true at once, and each sends an operator somewhere
      // different. Picking one silently drops a real failure from the report.
      const problems: string[] = [];
      if (restoreFailed) {
        problems.push(
          'the pre-existing pair could NOT be fully restored — inspect the .staging-bak files in the dist',
        );
      }
      if (publishedResidue) {
        problems.push(
          "this run's partly-published file could NOT be removed — the dist holds an unpaired artifact",
        );
      }
      const trailer = problems.length
        ? ` AND ${problems.join('; AND ')}`
        : ', any pre-existing pair restored';
      result = {
        staged: false,
        reason: `skills-classification staging aborted${trailer} — ${detail}`,
      };
    } finally {
      try {
        closeSync(lockFd);
      } catch {
        /* the descriptor is irrelevant once the file is gone */
      }
      // A lock that cannot be removed makes EVERY later stage skip. That is a
      // silent disable if it is only swallowed, so it rides out on the result.
      lockStuck = !discardOk(lockPath);
    }
    if (lockStuck) {
      result.warning = `the staging lock ${lockPath} could not be removed — later stages will skip until it is deleted`;
    }
    return result;
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
    // BYTES, read once — same reasoning as the AI pair above: build-side
    // acceptance must agree with the runtime loader's byte-exact check.
    const candidatesBytes = readFileSync(candidatesPath);
    const metaBytes = readFileSync(metaPath);
    const candidates = DiscoveryCandidatesFileSchema.parse(
      JSON.parse(candidatesBytes.toString('utf8')),
    );
    const meta = DiscoveryCandidatesMetaSchema.parse(JSON.parse(metaBytes.toString('utf8')));
    if (meta.dataset_sha !== createHash('sha256').update(candidatesBytes).digest('hex')) {
      return { staged: false, reason: 'discovery artifact hash mismatch — skipped' };
    }
    if (meta.candidate_count !== candidates.candidates.length) {
      return { staged: false, reason: 'discovery artifact count mismatch — skipped' };
    }
    // Publish the VALIDATED buffers, not a re-read of the sources.
    writeFileSync(resolve(opts.distDir, DISCOVERY_CANDIDATES_FILE), candidatesBytes);
    writeFileSync(resolve(opts.distDir, DISCOVERY_CANDIDATES_META_FILE), metaBytes);
    return { staged: true };
  } catch (error) {
    return {
      staged: false,
      reason: error instanceof Error ? error.message : 'discovery staging skipped',
    };
  }
}
