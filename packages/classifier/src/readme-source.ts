import { RetryCoordinator, classifyError } from '@starred/github-client';
import type { GithubClient } from '@starred/github-client';

export interface RepoCoordinates {
  owner: string;
  name: string;
}

export interface ReadmeRef {
  /** Repo-relative path of the preferred README (e.g. `README.md`, `docs/README.md`). */
  path: string;
  /** Opaque Git blob OID from GitHub (not a StarLedger SHA-256). */
  oid: string;
}

/**
 * The seam between trusted planning and GitHub, split so the planner avoids the
 * expensive operation:
 *   - `getReadmeRef`: the lightweight identity probe — preferred README path +
 *     blob OID, NO content. When `knownPath` is supplied (the path a prior run
 *     recorded) an implementation MAY resolve the current OID for exactly that
 *     path without downloading any content, falling back to full preferred-README
 *     discovery only when the path no longer exists. `knownPath` is an
 *     optimization hint, never authoritative — the provenance gate omits it so it
 *     always rediscovers the true preferred README;
 *   - `getReadmeContent`: the heavyweight byte fetch, called ONLY when a
 *     (re)classification is actually required.
 *
 * An unchanged README is therefore detected without transferring its payload
 * (README-2). Preprocessing is a separate pure function with no access to this
 * seam, so a link inside a README is never fetched (README-6).
 */
export interface ReadmeSource {
  getReadmeRef(repo: RepoCoordinates, knownPath?: string | null): Promise<ReadmeRef | null>;
  getReadmeContent(repo: RepoCoordinates, path: string): Promise<string | null>;
}

interface GithubReadmeResponse {
  path?: unknown;
  sha?: unknown;
  content?: unknown;
  encoding?: unknown;
}

interface BlobOidResponse {
  repository: { object: { oid?: unknown } | null } | null;
}

/** Resolve a blob's OID at a path on HEAD WITHOUT transferring its content. */
const BLOB_OID_QUERY = `query BlobOid($owner: String!, $name: String!, $expr: String!) {
  repository(owner: $owner, name: $name) {
    object(expression: $expr) {
      oid
    }
  }
}`;

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { status?: number }).status === 404
  );
}

/**
 * True for the `@octokit/graphql` error raised when a query names a repository
 * that no longer resolves — deleted, renamed away, or turned private since it was
 * starred. GitHub answers with HTTP 200 and a top-level `errors` array (a
 * `GraphqlResponseError`), which is structurally distinct from an HTTP-status
 * `RequestError` (auth / rate limit / 5xx): the latter carries no `errors` array,
 * so it returns false here and is left to propagate. Matching by error `type`
 * (not message text) keeps this stable across GitHub's wording changes.
 */
function isRepositoryNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const errors = (error as { errors?: unknown }).errors;
  if (!Array.isArray(errors)) return false;
  return errors.some((entry) => {
    if (typeof entry !== 'object' || entry === null) return false;
    const { type, path } = entry as { type?: unknown; path?: unknown };
    if (type !== 'NOT_FOUND') return false;
    // Scope the swallow to the `repository` field itself. BLOB_OID_QUERY resolves
    // exactly one node (`repository`), so GitHub's real error carries
    // path `['repository']`; requiring that keeps a NOT_FOUND on some future second
    // node from being silently absorbed as "repo gone". A NOT_FOUND with no path
    // still matches, so the real deleted-repo error can never slip back to a crash.
    return !Array.isArray(path) || path[0] === 'repository';
  });
}

/**
 * Production {@link ReadmeSource} over GitHub.
 *
 * For a KNOWN README path, `getReadmeRef` issues a single GraphQL
 * `object(expression: "HEAD:<path>") { oid }` query that returns the current blob
 * OID and NO content — so an unchanged README is detected without ever
 * transferring the payload. Only first discovery (no known path) or a README that
 * has moved/disappeared falls back to the REST preferred-README endpoint (which
 * does return content; it is fetched once, memoized, and reused by
 * `getReadmeContent`). A missing README (404 / null object) is a normal outcome →
 * `null`. Tests inject a fake instead of this.
 */
export class OctokitReadmeSource implements ReadmeSource {
  private readonly preferredReadmeCache = new Map<string, GithubReadmeResponse | null>();

  constructor(
    private readonly client: Pick<GithubClient, 'octokit' | 'graphql'>,
    // One coordinator per source instance — the planner reuses a single source
    // across the whole per-repo sweep, so the shared secondary-limit cooldown
    // pauses every probe together (the same shape as fetchAllStarsGraphql sharing
    // one coordinator across pages). The retry-wait budget is likewise batch-wide,
    // a deliberate trade: a sustained upstream outage fails the run loudly — and it
    // retries next schedule — rather than silently degrading every repo to metadata.
    private readonly coordinator: RetryCoordinator = new RetryCoordinator(),
  ) {}

  async getReadmeRef(repo: RepoCoordinates, knownPath?: string | null): Promise<ReadmeRef | null> {
    if (knownPath !== undefined && knownPath !== null && knownPath !== '') {
      const oid = await this.blobOid(repo, knownPath);
      if (oid !== null) return { path: knownPath, oid }; // content-free OID probe
      // the known path no longer exists → fall through to authoritative discovery
    }
    const res = await this.requestReadme(repo);
    if (res === null) return null;
    const path = typeof res.path === 'string' ? res.path : null;
    const oid = typeof res.sha === 'string' ? res.sha : null;
    return path !== null && oid !== null ? { path, oid } : null;
  }

  async getReadmeContent(repo: RepoCoordinates, path: string): Promise<string | null> {
    const res = await this.requestReadme(repo);
    if (
      res === null ||
      res.path !== path ||
      typeof res.content !== 'string' ||
      res.encoding !== 'base64'
    ) {
      return null;
    }
    return Buffer.from(res.content, 'base64').toString('utf8');
  }

  /**
   * Current blob OID for a path at HEAD, resolved via GraphQL WITHOUT content.
   *
   * Wrapped in the shared {@link RetryCoordinator} so a transient GitHub fault
   * (secondary rate limit, 5xx, GraphQL exec timeout) on any single probe retries
   * with bounded backoff instead of aborting the planner's whole per-repo sweep —
   * the production `graphql` client, unlike REST, carries no retry/throttle of its
   * own. A repository that no longer resolves is the one exception that must NOT
   * retry: it is a settled fact, so it short-circuits to null (treated exactly
   * like an absent README, as the REST path already maps a 404 to null). A single
   * vanished star therefore cannot crash the batch, while auth/invalid errors
   * still fail loudly.
   */
  private async blobOid(repo: RepoCoordinates, path: string): Promise<string | null> {
    const data = await this.coordinator.run<BlobOidResponse | null>(
      async () => {
        try {
          return await this.client.graphql<BlobOidResponse>(BLOB_OID_QUERY, {
            owner: repo.owner,
            name: repo.name,
            expr: `HEAD:${path}`,
          });
        } catch (error) {
          // BLOB_OID_QUERY selects exactly one resolvable node (`repository`); a
          // missing blob path yields `object: null` with NO error, so any
          // NOT_FOUND here means the repository itself is gone. Resolve to null so
          // the coordinator does NOT retry a repo that will never come back. If
          // this query ever grows a second resolvable node, revisit this
          // short-circuit so an unrelated NOT_FOUND cannot be swallowed.
          if (isRepositoryNotFound(error)) return null;
          throw error; // transient → coordinator retries; terminal → fails loudly
        }
      },
      { classify: classifyError },
    );
    // Optional chaining tolerates a NOT_FOUND short-circuit (null) AND the rare
    // empty 2xx envelope where raw @octokit/graphql yields `undefined` (the case
    // github-client's requireResponse guards; this direct caller must not crash on
    // it). Either way there is no OID, so getReadmeRef falls through to REST
    // discovery instead of aborting the whole per-repo sweep.
    const oid = data?.repository?.object?.oid;
    return typeof oid === 'string' ? oid : null;
  }

  private async requestReadme(repo: RepoCoordinates): Promise<GithubReadmeResponse | null> {
    const key = `${repo.owner}/${repo.name}`;
    const cached = this.preferredReadmeCache.get(key);
    if (cached !== undefined) return cached;
    try {
      const res = await this.client.octokit.request('GET /repos/{owner}/{repo}/readme', {
        owner: repo.owner,
        repo: repo.name,
      });
      const result = res.data as unknown as GithubReadmeResponse;
      this.preferredReadmeCache.set(key, result);
      return result;
    } catch (error) {
      if (isNotFound(error)) {
        this.preferredReadmeCache.set(key, null);
        return null;
      }
      throw error;
    }
  }
}
