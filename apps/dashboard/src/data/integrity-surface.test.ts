import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  serializeSkillsClassification,
  serializeSkillsClassificationMeta,
} from '@starred/skills-schema/contracts';
import { describe, expect, it } from 'vitest';
import { makeRepo, makeStarsFile } from '../test-utils';
import { loadAnnotations } from './load-annotations';
import { loadDiscovery } from './load-discovery';
import { loadSkillsClassification } from './load-skills-classification';
import { loadStars } from './load-stars';

/**
 * INTEGRITY IS MANDATORY — A SURFACE CONTRACT, EXPRESSED AS AN ALLOWLIST.
 *
 * The byte-level tests prove the digest is computed over received bytes. They
 * cannot prove the OTHER half: that no caller may switch the check off. Every
 * one of them uses default options, so a reintroduced opt-out passes them all —
 * demonstrated in review by adding one and watching the whole loader suite stay
 * green.
 *
 * A blacklist of suspicious names does not fix that: review defeated a
 * three-name blacklist twice, with `verifyIntegrity` and with `allowUnverified`.
 * Any name works, so the contract has to be stated the other way round — these
 * are the ONLY options a loader may accept. A new option is then a deliberate
 * edit to this list, which is exactly where someone should have to argue for it.
 */

const DATA_DIR = dirname(fileURLToPath(import.meta.url));

const LOADER_OPTIONS = [
  ['load-stars.ts', 'LoadOptions'],
  ['load-annotations.ts', 'AnnotationLoadOptions'],
  ['load-discovery.ts', 'DiscoveryLoadOptions'],
  ['load-skills-classification.ts', 'SkillsClassificationLoadOptions'],
] as const;

/** The complete set of options any loader may expose. Integrity is not optional. */
const ALLOWED_OPTIONS = new Set(['base', 'fetchImpl']);

function optionNames(source: string, interfaceName: string): string[] {
  // Exactly ONE declaration, and no intersection/extends: TypeScript MERGES
  // repeated interface declarations, so a second `interface LoadOptions {
  // skipIntegrity?: boolean }` elsewhere in the file would add a bypass this
  // parser never sees (review finding). Same for `extends`/`&`, which can pull
  // options in from another type.
  const declarations = [...source.matchAll(new RegExp(`interface\\s+${interfaceName}\\b`, 'g'))];
  if (declarations.length !== 1) {
    throw new Error(
      `${interfaceName} is declared ${declarations.length} times — merged declarations can hide an option`,
    );
  }
  const header = new RegExp(`interface\\s+${interfaceName}\\s+extends\\b`).test(source);
  if (header)
    throw new Error(`${interfaceName} extends another type — options must be declared inline`);
  const start = source.indexOf(`interface ${interfaceName} {`);
  if (start < 0) throw new Error(`${interfaceName} not found — rename it here too`);
  const open = source.indexOf('{', start);
  const end = source.indexOf('\n}', open);
  if (end < 0) throw new Error(`${interfaceName} body not terminated as expected`);
  const body = source
    .slice(open + 1, end)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  // Quoted names are LEGAL TypeScript (`'allowUnverified'?: boolean`) and were
  // invisible to a bare-identifier matcher (round-9 finding) — a quoted bypass
  // extracted as nothing and the allowlist comparison never saw it. Extract
  // BOTH forms, so any quoted declaration lands in the comparison and fails.
  return [...body.matchAll(/^\s*(?:(['"])(.+?)\1|([A-Za-z_$][\w$]*))\s*\??\s*:/gm)].map(
    (m) => (m[2] ?? m[3])!,
  );
}

/**
 * Strip comments before matching. Otherwise these contracts assert on PROSE —
 * the loaders' own comments explain that the opt-out was removed, and matching
 * those would make the contract unsatisfiable while proving nothing about the
 * API.
 */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/**
 * The options TYPE is only half the surface. A bypass can also arrive at the
 * PARAMETER — `loadStars(opts: LoadOptions & { bypassIntegrity?: boolean })` —
 * which leaves the interface untouched and every byte test green (reproduced in
 * review). So the exported entry point must name the bare options type.
 */
function parameterType(source: string, fn: string): string {
  const m = new RegExp(`export async function ${fn}\\s*\\(\\s*opts\\s*:\\s*([^=)]+)`).exec(source);
  if (!m?.[1]) throw new Error(`${fn}: could not read its options parameter type`);
  return m[1].trim();
}

const LOADER_ENTRIES = [
  ['load-stars.ts', 'loadStars', 'LoadOptions'],
  ['load-annotations.ts', 'loadAnnotations', 'AnnotationLoadOptions'],
  ['load-discovery.ts', 'loadDiscovery', 'DiscoveryLoadOptions'],
  ['load-skills-classification.ts', 'loadSkillsClassification', 'SkillsClassificationLoadOptions'],
] as const;

describe('INTEG-SURFACE: the entry points take the bare options type', () => {
  it.each(LOADER_ENTRIES)('%s › %s(opts: %s) — no intersection', (file, fn, type) => {
    const declared = parameterType(code(readFileSync(join(DATA_DIR, file), 'utf8')), fn);
    expect(declared, `${fn} must take ${type} exactly, with no intersection`).toBe(type);
  });

  it('CONTROL: an intersection parameter is detected', () => {
    const sample = 'export async function loadStars(opts: LoadOptions & Unsafe = {}) {}';
    expect(parameterType(sample, 'loadStars')).not.toBe('LoadOptions');
  });
});

describe('INTEG-SURFACE: loader options are an allowlist, so no opt-out can appear', () => {
  it.each(LOADER_OPTIONS)('%s › %s declares only allowed options', (file, name) => {
    const declared = optionNames(readFileSync(join(DATA_DIR, file), 'utf8'), name);
    // Guard the guard: a parser returning [] would make this pass vacuously.
    expect(declared.length, `${name} should declare at least one option`).toBeGreaterThan(0);
    for (const option of declared) {
      expect(ALLOWED_OPTIONS.has(option), `${name}.${option} is not an allowed loader option`).toBe(
        true,
      );
    }
  });

  it('CONTROL: a MERGED second declaration is rejected, not silently ignored', () => {
    const merged = [
      'export interface LoadOptions { base?: string; }',
      'interface LoadOptions { skipIntegrity?: boolean }',
      '',
    ].join('\n');
    expect(() => optionNames(merged, 'LoadOptions')).toThrow(/declared 2 times/);
  });

  it('CONTROL: the extractor sees a newly added option', () => {
    // Without this, a broken extractor would silently approve anything.
    const sample = [
      'export interface LoadOptions {',
      '  /** doc */',
      '  base?: string;',
      '  allowUnverified?: boolean; // a bypass under any name',
      '}',
      '',
    ].join('\n');
    expect(optionNames(sample, 'LoadOptions')).toEqual(['base', 'allowUnverified']);
    expect(ALLOWED_OPTIONS.has('allowUnverified')).toBe(false);
  });
});

/**
 * BEHAVIORAL half of the no-bypass contract (round-9 finding, luna@max). The
 * allowlist above pins the DECLARED surface, but a body-level bypass —
 * `(opts as any).skipIntegrity`, or a property pulled in by a merged
 * declaration in ANOTHER file — never appears in the interface text this file
 * parses, so every static pin stays green while the loader quietly consults
 * it. Pin the other side behaviorally: each loader must complete a fully
 * SUCCESSFUL load while its options object THROWS on any property read
 * outside the same allowlist. An implementation consulting an undeclared
 * option — under ANY name, through ANY cast — throws mid-load and cannot
 * reach the success state required here. (No failure-path twin is needed: an
 * opt-out consulted only on some other path still has to be READ before it
 * can matter, and the read is what this pin forbids.)
 */
describe('INTEG-NO-BYPASS-BEHAVIORAL: no loader reads an undeclared option', () => {
  function strictOptions<T extends object>(opts: T): T {
    return new Proxy(opts, {
      get(target, property, receiver) {
        if (typeof property === 'symbol') return Reflect.get(target, property, receiver);
        if (!ALLOWED_OPTIONS.has(property)) {
          throw new Error(`undeclared loader option read: ${property}`);
        }
        return Reflect.get(target, property, receiver);
      },
    });
  }

  const utf8 = (text: string) => new TextEncoder().encode(text);
  const sha256OfBytes = (bytes: Uint8Array) =>
    createHash('sha256').update(Buffer.from(bytes)).digest('hex');
  const serve = (metaName: string, metaText: string, body: string): typeof fetch =>
    (async (url: string | URL) =>
      String(url).includes(metaName)
        ? new Response(metaText, { status: 200 })
        : new Response(body, { status: 200 })) as typeof fetch;

  it('stars', async () => {
    const starsText = JSON.stringify(makeStarsFile([makeRepo({ node_id: 'R_1' })]));
    const metaText = JSON.stringify({
      schema_version: '1.0',
      dataset_generated_at: '2026-06-18T00:00:00Z',
      stars_sha256: sha256OfBytes(utf8(starsText)),
      repo_count: 1,
    });
    await expect(
      loadStars(strictOptions({ fetchImpl: serve('dataset-meta.json', metaText, starsText) })),
    ).resolves.toBeTruthy();
  });

  it('annotations', async () => {
    const annText = JSON.stringify({
      schema_version: '1.0',
      taxonomy_version: '1',
      annotations: [],
    });
    const metaText = JSON.stringify({
      schema_version: '1.0',
      annotations_sha256: sha256OfBytes(utf8(annText)),
      annotation_count: 0,
      taxonomy_version: '1',
      dataset_sha256: '0'.repeat(64),
      generated_at: '2026-06-20T00:00:00Z',
    });
    await expect(
      loadAnnotations(
        strictOptions({ fetchImpl: serve('ai-annotations-meta.json', metaText, annText) }),
      ),
    ).resolves.not.toBeNull();
  });

  it('discovery', async () => {
    const source = {
      kind: 'manual',
      source_id: 'owner/repo',
      source_url: 'https://github.com/owner/repo',
      observed_at: '2026-01-15T00:00:00.000Z',
    };
    const text = JSON.stringify({
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
    const metaText = JSON.stringify({
      schema_version: 1,
      generated_at: '2026-01-15T00:00:00.000Z',
      dataset_sha: sha256OfBytes(utf8(text)),
      candidate_count: 1,
      source_count: 1,
      generator_version: '0.1.0',
    });
    await expect(
      loadDiscovery(
        strictOptions({ fetchImpl: serve('discovery-candidates-meta.json', metaText, text) }),
      ),
    ).resolves.not.toBeNull();
  });

  it('skills classification', async () => {
    const artifactText = serializeSkillsClassification({
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
          node_id: 'R_kgDOproxy001',
          resolution: 'resolved',
          primary_category_id: 'verification-qa',
          secondary_category_ids: [],
          summary: 'Proxy fixture entry.',
        },
      ],
    });
    const metaText = serializeSkillsClassificationMeta({
      schema_version: '1.0',
      taxonomy_version: 'skills-1',
      classification_sha256: sha256OfBytes(utf8(artifactText)),
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
    });
    await expect(
      loadSkillsClassification(
        strictOptions({
          fetchImpl: serve('skills-classification-meta.json', metaText, artifactText),
        }),
      ),
    ).resolves.not.toBeNull();
  });
});
