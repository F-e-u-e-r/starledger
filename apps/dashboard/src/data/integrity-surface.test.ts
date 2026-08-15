import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

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
  const start = source.indexOf(`interface ${interfaceName} {`);
  if (start < 0) throw new Error(`${interfaceName} not found — rename it here too`);
  const open = source.indexOf('{', start);
  const end = source.indexOf('\n}', open);
  if (end < 0) throw new Error(`${interfaceName} body not terminated as expected`);
  const body = source
    .slice(open + 1, end)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  return [...body.matchAll(/^\s*([A-Za-z_$][\w$]*)\s*\??\s*:/gm)].map((m) => m[1]!);
}

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
