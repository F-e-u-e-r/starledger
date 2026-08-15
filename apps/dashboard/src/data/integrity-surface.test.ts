import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * INTEGRITY IS MANDATORY — A SURFACE CONTRACT.
 *
 * The byte-level tests prove the digest is computed over received bytes. They
 * cannot prove the OTHER half of the contract: that no caller may switch the
 * check off. A reintroduced `verifyBytes?: boolean` opt-out passes every one of
 * them, because they all use default options — verified in review by adding the
 * bypass back and watching the whole loader suite stay green.
 *
 * This is therefore a structural assertion over the loader sources, in the same
 * spirit as the Pages-trigger contract: the escape hatch must not exist at all.
 * If a legitimate need for one ever appears, that is a contract change and this
 * test is where it gets argued.
 */

const DATA_DIR = dirname(fileURLToPath(import.meta.url));

const LOADERS = [
  'load-stars.ts',
  'load-annotations.ts',
  'load-discovery.ts',
  'load-skills-classification.ts',
] as const;

/** Option-shaped names that would let a caller disable byte verification. */
const BYPASS_PATTERNS = [/\bverifyBytes\b/, /\bskipIntegrity\b/, /\bcheckBytes\b/];

/**
 * Strip comments before matching. Otherwise this test asserts on PROSE — the
 * loaders' own comments explain that the opt-out was removed, and matching those
 * would make the contract un-satisfiable while telling us nothing about the API.
 */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

describe('INTEG-SURFACE: no loader exposes an integrity opt-out', () => {
  it.each(LOADERS)('%s declares no bypass option', (file: string) => {
    const source = code(readFileSync(join(DATA_DIR, file), 'utf8'));
    for (const pattern of BYPASS_PATTERNS) {
      expect(source, `${file} must not offer an integrity bypass (${pattern})`).not.toMatch(
        pattern,
      );
    }
  });

  it('CONTROL: the patterns can actually match (guards the guard)', () => {
    // Without this, a typo in every pattern would make the assertions above
    // pass vacuously forever.
    const sample = code('interface O { verifyBytes?: boolean } // comment');
    expect(BYPASS_PATTERNS.some((p) => p.test(sample))).toBe(true);
    // ...and that the stripper does not eat real code.
    expect(code('const a = 1; // note')).toContain('const a = 1;');
  });
});
