#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  AiAnnotationsSchema,
  ClassificationCandidatesSchema,
  ClassificationManifestSchema,
  buildClassificationManifest,
  serializeClassificationManifest,
} from '@starred/ai-schema';
import { Command } from 'commander';
import { verifyAgentPullRequestFromGit } from './agent-gate';
import { assembleAiArtifacts, verifyAiArtifacts } from './assemble';
import { loadAiConfig } from './config';
import { validateCandidate } from './validate-candidate';
import { changedPathEntriesBetween, verifyAgentDiffEntries } from './verify-diff';
import { CLASSIFIER_VERSION } from './index';

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeText(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text, 'utf8');
}

function fatal(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`fatal (exit 10): ${message}\n`);
  process.exit(10);
}

const program = new Command();
program
  .name('stars-classify')
  .description(
    'Deterministic AI-enrichment contracts. Agents produce untrusted candidates; this CLI validates and assembles artifacts.',
  )
  .version(CLASSIFIER_VERSION)
  .option('-c, --config <path>', 'path to ai.yaml')
  .action((opts: { config?: string }) => {
    try {
      const config = loadAiConfig(opts.config);
      process.stdout.write(
        `classifier config OK — enabled=${config.ai.enabled} ` +
          `prompt=${config.ai.prompt_version} ` +
          `profile=${config.ai.execution_profile.execution_profile_version} ` +
          `budget(total)=${config.ai.budget.max_total_per_run}\n`,
      );
      process.stdout.write(
        'P3.0 validates agent contracts; planning and scheduling land in later milestones.\n',
      );
    } catch (error) {
      fatal(error);
    }
  });

program
  .command('plan')
  .description(
    'Emit an empty deterministic manifest scaffold; P3.1 supplies bounded repository jobs.',
  )
  .requiredOption('-o, --out <path>', 'temporary manifest output path')
  .action((opts: { out: string }) => {
    try {
      const config = loadAiConfig(program.opts<{ config?: string }>().config);
      const manifest = buildClassificationManifest({
        promptVersion: config.ai.prompt_version,
        executionProfileVersion: config.ai.execution_profile.execution_profile_version,
        executorKind: config.ai.executor_kind,
        jobs: [],
      });
      writeText(opts.out, serializeClassificationManifest(manifest));
      process.stdout.write(`wrote temporary manifest with 0 jobs: ${opts.out}\n`);
    } catch (error) {
      fatal(error);
    }
  });

program
  .command('validate-candidates')
  .description('Validate untrusted agent candidates against a deterministic manifest')
  .requiredOption('--manifest <path>', 'classification manifest JSON')
  .requiredOption('--candidates <path>', 'candidate bundle JSON')
  .action((opts: { manifest: string; candidates: string }) => {
    try {
      const manifest = ClassificationManifestSchema.parse(readJson(opts.manifest));
      const candidates = ClassificationCandidatesSchema.parse(readJson(opts.candidates));
      const jobs = new Map(manifest.jobs.map((job) => [job.job_id, job]));
      for (const candidate of candidates.candidates) {
        const job = jobs.get(candidate.job_id);
        if (job === undefined)
          throw new Error(`candidate references unknown job_id ${candidate.job_id}`);
        validateCandidate(candidate, job);
      }
      process.stdout.write(`validated ${candidates.candidates.length} candidate(s)\n`);
    } catch (error) {
      fatal(error);
    }
  });

program
  .command('apply')
  .description('Merge validated candidates into deterministic public AI artifacts')
  .requiredOption('--manifest <path>', 'classification manifest JSON')
  .requiredOption('--candidates <path>', 'candidate bundle JSON')
  .requiredOption('--dataset-sha <sha256>', 'current canonical stars.json SHA-256')
  .requiredOption('--generated-at <iso-date>', 'timestamp for changed annotation records')
  .requiredOption('--out-dir <path>', 'directory for ai-annotations artifacts')
  .option('--current <path>', 'existing ai-annotations.json')
  .action(
    (opts: {
      manifest: string;
      candidates: string;
      datasetSha: string;
      generatedAt: string;
      outDir: string;
      current?: string;
    }) => {
      try {
        const manifest = ClassificationManifestSchema.parse(readJson(opts.manifest));
        const candidates = ClassificationCandidatesSchema.parse(readJson(opts.candidates));
        const jobs = new Map(manifest.jobs.map((job) => [job.job_id, job]));
        const validated = candidates.candidates.map((candidate) => {
          const job = jobs.get(candidate.job_id);
          if (job === undefined)
            throw new Error(`candidate references unknown job_id ${candidate.job_id}`);
          return validateCandidate(candidate, job);
        });
        const currentAnnotations =
          opts.current !== undefined && existsSync(opts.current)
            ? AiAnnotationsSchema.parse(readJson(opts.current)).annotations
            : [];
        const result = assembleAiArtifacts({
          currentAnnotations,
          validatedCandidates: validated,
          datasetSha256: opts.datasetSha,
          generatedAt: opts.generatedAt,
        });
        if (!result.changed || result.metaBytes === null) {
          process.stdout.write('AI artifacts unchanged; no files written.\n');
          return;
        }
        writeText(join(opts.outDir, 'ai-annotations.json'), result.annotationsBytes);
        writeText(join(opts.outDir, 'ai-annotations-meta.json'), result.metaBytes);
        process.stdout.write(
          `wrote ${result.annotations.length} annotation(s) to ${opts.outDir}\n`,
        );
      } catch (error) {
        fatal(error);
      }
    },
  );

program
  .command('verify-artifacts')
  .description('Validate the public artifact schemas, count, taxonomy, and exact-byte hash')
  .requiredOption('--annotations <path>', 'ai-annotations.json')
  .requiredOption('--meta <path>', 'ai-annotations-meta.json')
  .action((opts: { annotations: string; meta: string }) => {
    try {
      verifyAiArtifacts(readFileSync(opts.annotations, 'utf8'), readFileSync(opts.meta, 'utf8'));
      process.stdout.write('AI artifacts verified.\n');
    } catch (error) {
      fatal(error);
    }
  });

program
  .command('verify-agent-diff')
  .description(
    'Reject an agent branch that changes a path outside the public AI artifact allowlist',
  )
  .option('--base <ref>', 'merge-base reference', 'origin/main')
  .option('--head <ref>', 'head reference', 'HEAD')
  .action((opts: { base: string; head: string }) => {
    try {
      const entries = changedPathEntriesBetween(opts.base, opts.head);
      verifyAgentDiffEntries(entries);
      process.stdout.write(`agent diff verified (${entries.length} allowed change(s)).\n`);
    } catch (error) {
      fatal(error);
    }
  });

program
  .command('verify-agent-pr')
  .description(
    'Path-triggered structural gate: inspect any PR, and whenever an AI artifact ' +
      'changes require an approved same-repository executor branch and a valid artifact pair',
  )
  .requiredOption('--base <ref>', 'trusted base reference (e.g. the PR base SHA)')
  .option('--head <ref>', 'git ref holding the PR head commit, fetched as data', 'HEAD')
  .requiredOption('--head-ref <branch>', 'PR head branch name (executor identity)')
  .requiredOption('--head-repo <owner/name>', 'PR head repository full name')
  .requiredOption('--repo <owner/name>', 'this (base) repository full name')
  .action(
    (opts: { base: string; head: string; headRef: string; headRepo: string; repo: string }) => {
      try {
        const result = verifyAgentPullRequestFromGit({
          baseRef: opts.base,
          headGitRef: opts.head,
          headBranch: opts.headRef,
          headRepo: opts.headRepo,
          repo: opts.repo,
        });
        process.stdout.write(
          result.touched
            ? 'AI artifact gate passed: approved same-repository executor pair verified.\n'
            : 'No AI artifacts changed; structural gate not required.\n',
        );
      } catch (error) {
        fatal(error);
      }
    },
  );

void program.parseAsync(process.argv);
