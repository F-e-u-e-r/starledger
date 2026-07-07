import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeFixtureDataset } from '../src/fixture';
import { stageDashboardData } from '../src/stage';
import { staticSmoke, verifyBuiltArtifact } from '../src/verify';

// Mirror the production index.html CSP meta so the fixture exercises SEC-B.
const CSP_META =
  "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'\" />";

function builtDist(base = '/repo/') {
  const root = mkdtempSync(join(tmpdir(), 'verify-'));
  const dataDir = join(root, 'data');
  const distDir = join(root, 'dist');
  mkdirSync(dataDir);
  mkdirSync(join(distDir, 'assets'), { recursive: true });
  writeFileSync(join(distDir, 'assets', 'index-abc.js'), 'console.log(1)\n');
  writeFileSync(
    join(distDir, 'index.html'),
    `<!doctype html><html><head>${CSP_META}<script type="module" src="${base}assets/index-abc.js"></script></head><body><div id="root"></div></body></html>`,
  );
  writeFixtureDataset(dataDir);
  stageDashboardData({ dataDir, distDir });
  return { distDir, base };
}

describe('verifyBuiltArtifact / staticSmoke (DEPLOY-1/2, PATH-2)', () => {
  it('DEPLOY-1: a well-formed staged dist verifies under its base path', () => {
    const { distDir, base } = builtDist();
    const r = verifyBuiltArtifact({ distDir, base });
    expect(r.repoCount).toBe(1);
    expect(r.base).toBe(base);
  });

  it('PATH-2: assets that are not under the base path are rejected', () => {
    const { distDir } = builtDist('/'); // index references root-absolute /assets/...
    expect(() => verifyBuiltArtifact({ distDir, base: '/repo/' })).toThrow(/base/);
  });

  it('rejects a dist that is missing the staged data', () => {
    const root = mkdtempSync(join(tmpdir(), 'verify-'));
    const distDir = join(root, 'dist');
    mkdirSync(join(distDir, 'assets'), { recursive: true });
    writeFileSync(join(distDir, 'assets', 'a.js'), 'x');
    writeFileSync(join(distDir, 'index.html'), '<script src="/assets/a.js"></script>');
    expect(() => verifyBuiltArtifact({ distDir })).toThrow(/staged data/);
  });

  it('DEPLOY-2: data + assets resolve over a static server at the base path', async () => {
    const { distDir, base } = builtDist();
    const r = await staticSmoke({ distDir, base });
    expect(r.repoCount).toBe(1);
  });

  it('SEC-B: a built dist whose index.html dropped the CSP meta is rejected', () => {
    const root = mkdtempSync(join(tmpdir(), 'verify-'));
    const dataDir = join(root, 'data');
    const distDir = join(root, 'dist');
    mkdirSync(dataDir);
    mkdirSync(join(distDir, 'assets'), { recursive: true });
    writeFileSync(join(distDir, 'assets', 'index-abc.js'), 'console.log(1)\n');
    // Same well-formed dist as builtDist(), but WITHOUT the CSP meta.
    writeFileSync(
      join(distDir, 'index.html'),
      '<!doctype html><html><head><script type="module" src="/repo/assets/index-abc.js"></script></head><body><div id="root"></div></body></html>',
    );
    writeFixtureDataset(dataDir);
    stageDashboardData({ dataDir, distDir });
    expect(() => verifyBuiltArtifact({ distDir, base: '/repo/' })).toThrow(
      /Content-Security-Policy/,
    );
  });

  it('SEC-B: a CSP that reintroduces the meta-ineffective frame-ancestors is rejected', () => {
    const root = mkdtempSync(join(tmpdir(), 'verify-'));
    const dataDir = join(root, 'data');
    const distDir = join(root, 'dist');
    mkdirSync(dataDir);
    mkdirSync(join(distDir, 'assets'), { recursive: true });
    writeFileSync(join(distDir, 'assets', 'index-abc.js'), 'console.log(1)\n');
    const cspWithFrameAncestors =
      "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'self'; frame-ancestors 'none'\" />";
    writeFileSync(
      join(distDir, 'index.html'),
      `<!doctype html><html><head>${cspWithFrameAncestors}<script type="module" src="/repo/assets/index-abc.js"></script></head><body><div id="root"></div></body></html>`,
    );
    writeFixtureDataset(dataDir);
    stageDashboardData({ dataDir, distDir });
    expect(() => verifyBuiltArtifact({ distDir, base: '/repo/' })).toThrow(/frame-ancestors/);
  });

  it('SEC-B: a commented-out CSP meta is rejected (the browser does not enforce it)', () => {
    const root = mkdtempSync(join(tmpdir(), 'verify-'));
    const dataDir = join(root, 'data');
    const distDir = join(root, 'dist');
    mkdirSync(dataDir);
    mkdirSync(join(distDir, 'assets'), { recursive: true });
    writeFileSync(join(distDir, 'assets', 'index-abc.js'), 'console.log(1)\n');
    // Well-formed except the CSP meta is commented out — an inert, unenforced policy.
    writeFileSync(
      join(distDir, 'index.html'),
      `<!doctype html><html><head><!-- ${CSP_META} --><script type="module" src="/repo/assets/index-abc.js"></script></head><body><div id="root"></div></body></html>`,
    );
    writeFixtureDataset(dataDir);
    stageDashboardData({ dataDir, distDir });
    expect(() => verifyBuiltArtifact({ distDir, base: '/repo/' })).toThrow(
      /Content-Security-Policy/,
    );
  });

  it('SEC-B: directives cannot be borrowed from a later meta tag (split-tag bypass)', () => {
    const root = mkdtempSync(join(tmpdir(), 'verify-'));
    const dataDir = join(root, 'data');
    const distDir = join(root, 'dist');
    mkdirSync(dataDir);
    mkdirSync(join(distDir, 'assets'), { recursive: true });
    writeFileSync(join(distDir, 'assets', 'index-abc.js'), 'console.log(1)\n');
    // The CSP meta itself has NO content; a later decoy meta carries directives.
    // The browser enforces nothing from the empty CSP meta, so this must fail.
    const splitTag =
      '<meta http-equiv="Content-Security-Policy"><meta name="decoy" content="default-src \'none\'; script-src \'self\'" />';
    writeFileSync(
      join(distDir, 'index.html'),
      `<!doctype html><html><head>${splitTag}<script type="module" src="/repo/assets/index-abc.js"></script></head><body><div id="root"></div></body></html>`,
    );
    writeFixtureDataset(dataDir);
    stageDashboardData({ dataDir, distDir });
    expect(() => verifyBuiltArtifact({ distDir, base: '/repo/' })).toThrow(/content attribute/);
  });
});
