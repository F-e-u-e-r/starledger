import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { verifyDatasetIntegrity } from './dataset';
import { assertNoForbiddenFiles, DATASET_META_FILE, STARS_FILE } from './stage';

export interface VerifyOptions {
  distDir: string;
  /** Derived Pages base path, e.g. `/starledger/`. Default `/`. */
  base?: string;
}

export interface VerifyResult {
  repoCount: number;
  sha256: string;
  base: string;
}

function assetUrls(html: string): string[] {
  return [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((m) => m[1] ?? '')
    .filter((u) => u.includes('/assets/'));
}

/** Directives that must survive into the built index.html (SEC-B). */
const REQUIRED_CSP_DIRECTIVES = ["default-src 'none'", "script-src 'self'"];
/**
 * Directives that are IGNORED when a CSP is delivered via <meta> (they need a
 * response header Pages cannot set) and only log a console error. They must not
 * be reintroduced into the meta policy (SEC-B).
 */
const FORBIDDEN_CSP_DIRECTIVES = ['frame-ancestors'];

/**
 * Assert the Content-Security-Policy meta survived the build (SEC-B). GitHub
 * Pages cannot send a CSP response header, so this meta is the only backstop;
 * if a tooling change drops it, weakens a load-bearing directive, or reintroduces
 * a meta-ineffective one, the deploy must fail here rather than silently shipping
 * an unprotected — or console-erroring — page. HTML comments are stripped first,
 * so a commented-out CSP meta (which the browser does NOT enforce) cannot satisfy
 * the check, and an explanatory comment mentioning a directive name cannot trip
 * it. The policy is read from a SINGLE `<meta …>` tag (attributes cannot span the
 * closing `>`), so directives can never be borrowed from a later unrelated tag's
 * `content` attribute (a split-tag bypass).
 */
function assertContentSecurityPolicy(html: string): void {
  const active = html.replace(/<!--[\s\S]*?-->/g, '');
  const cspTag = (active.match(/<meta\b[^>]*>/gi) ?? []).find((tag) =>
    /http-equiv\s*=\s*["']?Content-Security-Policy["']?/i.test(tag),
  );
  if (!cspTag) {
    throw new Error(
      'index.html is missing the Content-Security-Policy meta (SEC-B): Pages cannot set a CSP header, so this meta is the only backstop',
    );
  }
  const content = cspTag.match(/content\s*=\s*"([^"]*)"/i);
  if (!content) {
    throw new Error(
      'the Content-Security-Policy meta has no content attribute (SEC-B): an empty policy enforces nothing',
    );
  }
  const policy = content[1] ?? '';
  for (const directive of REQUIRED_CSP_DIRECTIVES) {
    if (!policy.includes(directive)) {
      throw new Error(
        `Content-Security-Policy is missing the required "${directive}" directive (SEC-B)`,
      );
    }
  }
  for (const directive of FORBIDDEN_CSP_DIRECTIVES) {
    if (policy.includes(directive)) {
      throw new Error(
        `Content-Security-Policy must not include "${directive}" (SEC-B): it is ignored in a <meta> and only logs a console error; framing protection needs a response header Pages cannot set`,
      );
    }
  }
}

/**
 * Validate a built + staged dist before upload (DEPLOY-1):
 *  - index.html, a non-empty assets/, and both data files exist;
 *  - the data passes schema / hash / count integrity;
 *  - no secret or telemetry files leaked into the artifact;
 *  - under a project base path, every emitted asset URL is base-prefixed (PATH-2).
 */
export function verifyBuiltArtifact(opts: VerifyOptions): VerifyResult {
  const { distDir } = opts;
  const base = opts.base ?? '/';

  const indexPath = resolve(distDir, 'index.html');
  if (!existsSync(indexPath)) throw new Error('dist/index.html is missing');
  const assetsDir = resolve(distDir, 'assets');
  if (!existsSync(assetsDir) || readdirSync(assetsDir).length === 0) {
    throw new Error('dist/assets is missing or empty');
  }

  const starsPath = resolve(distDir, STARS_FILE);
  const metaPath = resolve(distDir, DATASET_META_FILE);
  if (!existsSync(starsPath) || !existsSync(metaPath)) {
    throw new Error('dist is missing staged data files (run staging first)');
  }
  const verified = verifyDatasetIntegrity(
    readFileSync(starsPath, 'utf8'),
    readFileSync(metaPath, 'utf8'),
  );

  assertNoForbiddenFiles(distDir);

  const html = readFileSync(indexPath, 'utf8');
  assertContentSecurityPolicy(html);
  const assets = assetUrls(html);
  if (assets.length === 0) throw new Error('index.html references no /assets/ URLs');
  if (base !== '/') {
    const bad = assets.filter((u) => !u.startsWith(base));
    if (bad.length > 0) throw new Error(`assets not under base ${base}: ${bad.join(', ')}`);
  }

  return { repoCount: verified.meta.repo_count, sha256: verified.sha256, base };
}

/**
 * End-to-end static smoke (DEPLOY-2): serve the dist so that `<base>` maps to its
 * root, then resolve index.html, an asset, dataset-meta.json and the sha-busted
 * stars.json over HTTP and re-verify integrity — the same path the browser takes.
 */
export async function staticSmoke(opts: VerifyOptions): Promise<VerifyResult> {
  const { distDir } = opts;
  const base = opts.base ?? '/';

  const server = createServer((req, res) => {
    try {
      const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/');
      let rel = urlPath.startsWith(base) ? urlPath.slice(base.length) : urlPath.replace(/^\/+/, '');
      if (rel === '' || rel.endsWith('/')) rel += 'index.html';
      const filePath = resolve(distDir, rel);
      if (!filePath.startsWith(resolve(distDir)) || !existsSync(filePath)) {
        res.statusCode = 404;
        res.end('not found');
        return;
      }
      res.statusCode = 200;
      res.end(readFileSync(filePath));
    } catch {
      res.statusCode = 500;
      res.end('error');
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject); // otherwise a bind failure (EPERM/EADDRINUSE) would hang
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  const origin = `http://127.0.0.1:${port}`;

  try {
    const metaRes = await fetch(`${origin}${base}${DATASET_META_FILE}`);
    if (!metaRes.ok) throw new Error(`${DATASET_META_FILE} → HTTP ${metaRes.status}`);
    const metaText = await metaRes.text();
    const sha = (JSON.parse(metaText) as { stars_sha256: string }).stars_sha256;

    const starsRes = await fetch(`${origin}${base}${STARS_FILE}?sha=${sha}`);
    if (!starsRes.ok) throw new Error(`${STARS_FILE} → HTTP ${starsRes.status}`);
    const starsText = await starsRes.text();
    const verified = verifyDatasetIntegrity(starsText, metaText);

    const indexRes = await fetch(`${origin}${base}`);
    if (!indexRes.ok) throw new Error(`index → HTTP ${indexRes.status}`);
    const asset = assetUrls(await indexRes.text())[0];
    if (asset) {
      const assetRes = await fetch(`${origin}${asset}`);
      if (!assetRes.ok) throw new Error(`asset ${asset} → HTTP ${assetRes.status}`);
    }

    return { repoCount: verified.meta.repo_count, sha256: verified.sha256, base };
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}
