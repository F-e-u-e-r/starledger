import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findUnpinnedActionRefs } from '../src/workflows';

describe('findUnpinnedActionRefs (S4)', () => {
  it('accepts a 40-hex SHA-pinned ref (tag comment ignored)', () => {
    const wf = '      - uses: actions/checkout@93cb6efe18208431cddfb8368fd83d5badbf9bfd # v5\n';
    expect(findUnpinnedActionRefs(wf)).toEqual([]);
  });

  it('reports a mutable tag and a branch ref', () => {
    const wf = [
      '      - uses: actions/checkout@v5',
      '        uses: actions/setup-node@main',
      '      - uses: pnpm/action-setup@0ebf47130e4866e96fce0953f49152a61190b271 # v6',
    ].join('\n');
    expect(findUnpinnedActionRefs(wf)).toEqual(['actions/checkout@v5', 'actions/setup-node@main']);
  });

  it('ignores local action / reusable-workflow refs', () => {
    const wf = '      - uses: ./.github/actions/local\n    uses: ../shared/wf.yml\n';
    expect(findUnpinnedActionRefs(wf)).toEqual([]);
  });

  it('reports a ref with no @ pin at all', () => {
    expect(findUnpinnedActionRefs('      - uses: actions/checkout\n')).toEqual([
      'actions/checkout',
    ]);
  });
});

describe('every action ref in .github/workflows is SHA-pinned (S4 guard)', () => {
  it('has no unpinned external action refs', () => {
    const dir = resolve(import.meta.dirname, '../../../.github/workflows');
    const files = readdirSync(dir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
    expect(files.length).toBeGreaterThan(0);
    const offenders: string[] = [];
    for (const file of files) {
      for (const ref of findUnpinnedActionRefs(readFileSync(join(dir, file), 'utf8'))) {
        offenders.push(`${file}: ${ref}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
