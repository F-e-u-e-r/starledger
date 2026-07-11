import { RetryCoordinator } from '@starred/github-client';
import { describe, expect, it, vi } from 'vitest';
import { OctokitReadmeSource } from '../src/readme-source';

const REPO = { owner: 'owner', name: 'repo' };

describe('OctokitReadmeSource', () => {
  it('reuses one preferred-README response for the identity probe and selected content', async () => {
    const request = vi.fn().mockResolvedValue({
      data: {
        path: 'README.md',
        sha: 'oid-1',
        content: Buffer.from('trusted README bytes', 'utf8').toString('base64'),
        encoding: 'base64',
      },
    });
    const source = new OctokitReadmeSource({ octokit: { request } } as never);

    await expect(source.getReadmeRef(REPO)).resolves.toEqual({ path: 'README.md', oid: 'oid-1' });
    await expect(source.getReadmeContent(REPO, 'README.md')).resolves.toBe('trusted README bytes');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('does not return cached preferred content for a path that changed after the probe', async () => {
    const request = vi.fn().mockResolvedValue({
      data: {
        path: 'README.md',
        sha: 'oid-1',
        content: Buffer.from('body', 'utf8').toString('base64'),
        encoding: 'base64',
      },
    });
    const source = new OctokitReadmeSource({ octokit: { request } } as never);

    await source.getReadmeRef(REPO);
    await expect(source.getReadmeContent(REPO, 'docs/README.md')).resolves.toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
  });
});

describe('OctokitReadmeSource — content-free OID probe', () => {
  function notFound(): Error {
    return Object.assign(new Error('not found'), { status: 404 });
  }
  function source(opts: {
    graphqlOid?: string | null;
    readme?: { path: string; sha: string; content: string };
    onReadme?: () => void;
  }): OctokitReadmeSource {
    const graphql = vi.fn(() =>
      Promise.resolve({
        repository: {
          object:
            opts.graphqlOid !== undefined && opts.graphqlOid !== null
              ? { oid: opts.graphqlOid }
              : null,
        },
      }),
    );
    const request = vi.fn(() => {
      opts.onReadme?.();
      if (opts.readme === undefined) return Promise.reject(notFound());
      return Promise.resolve({
        data: {
          path: opts.readme.path,
          sha: opts.readme.sha,
          content: Buffer.from(opts.readme.content, 'utf8').toString('base64'),
          encoding: 'base64',
        },
      });
    });
    return new OctokitReadmeSource({ graphql, octokit: { request } } as never);
  }

  it('resolves a known path OID via GraphQL WITHOUT calling the README REST endpoint', async () => {
    let readmeCalls = 0;
    const src = source({ graphqlOid: 'oid-abc', onReadme: () => (readmeCalls += 1) });
    await expect(src.getReadmeRef(REPO, 'README.md')).resolves.toEqual({
      path: 'README.md',
      oid: 'oid-abc',
    });
    expect(readmeCalls).toBe(0); // no content payload transferred
  });

  it('falls back to preferred-README discovery when the known path no longer exists', async () => {
    const src = source({
      graphqlOid: null,
      readme: { path: 'docs/README.md', sha: 'oid-new', content: '# moved' },
    });
    await expect(src.getReadmeRef(REPO, 'README.md')).resolves.toEqual({
      path: 'docs/README.md',
      oid: 'oid-new',
    });
  });

  it('discovers the preferred README when no known path is supplied', async () => {
    const src = source({ readme: { path: 'README.md', sha: 'oid-1', content: '# hi' } });
    await expect(src.getReadmeRef(REPO)).resolves.toEqual({ path: 'README.md', oid: 'oid-1' });
  });
});

describe('OctokitReadmeSource — vanished repo & transient graphql faults', () => {
  // @octokit/graphql answers an unresolvable repository with HTTP 200 + a
  // top-level `errors` array (a GraphqlResponseError), NOT an HTTP-status error.
  function graphqlRepoNotFound(): Error {
    return Object.assign(new Error('Request failed due to following response errors:'), {
      errors: [
        {
          type: 'NOT_FOUND',
          path: ['repository'],
          message: "Could not resolve to a Repository with the name 'owner/repo'.",
        },
      ],
    });
  }
  const httpStatus = (status: number, message: string): Error =>
    Object.assign(new Error(message), { status });
  // A coordinator that never really sleeps, so retry paths stay instant + deterministic.
  const instantCoordinator = (): RetryCoordinator =>
    new RetryCoordinator({ sleep: async () => {}, now: () => 0, random: () => 0 });

  it('treats a repository that no longer resolves as an absent README, without retrying', async () => {
    const graphql = vi.fn(() => Promise.reject(graphqlRepoNotFound()));
    const request = vi.fn(() => Promise.reject(httpStatus(404, 'Not Found'))); // deleted repo → REST 404s too
    const src = new OctokitReadmeSource(
      { graphql, octokit: { request } } as never,
      instantCoordinator(),
    );

    await expect(src.getReadmeRef(REPO, 'README.md')).resolves.toBeNull();
    expect(graphql).toHaveBeenCalledTimes(1); // NOT_FOUND is settled → must NOT retry
    expect(request).toHaveBeenCalledTimes(1); // fell through to REST discovery, which also 404s
  });

  it('retries a transient graphql fault with bounded backoff, then succeeds', async () => {
    const graphql = vi
      .fn()
      .mockRejectedValueOnce(httpStatus(502, 'Bad Gateway'))
      .mockResolvedValueOnce({ repository: { object: { oid: 'oid-after-retry' } } });
    const request = vi.fn();
    const src = new OctokitReadmeSource(
      { graphql, octokit: { request } } as never,
      instantCoordinator(),
    );

    await expect(src.getReadmeRef(REPO, 'README.md')).resolves.toEqual({
      path: 'README.md',
      oid: 'oid-after-retry',
    });
    expect(graphql).toHaveBeenCalledTimes(2); // one transient failure, then a retry that succeeds
    expect(request).not.toHaveBeenCalled(); // fast path resolved; no README payload transferred
  });

  it('propagates a terminal graphql error (auth) instead of masking it as a missing README', async () => {
    const graphql = vi.fn(() => Promise.reject(httpStatus(401, 'Bad credentials')));
    const request = vi.fn();
    const src = new OctokitReadmeSource(
      { graphql, octokit: { request } } as never,
      instantCoordinator(),
    );

    await expect(src.getReadmeRef(REPO, 'README.md')).rejects.toThrow();
    expect(request).not.toHaveBeenCalled(); // a real fault must fail loudly, never fall through to null
  });

  it('falls through to REST discovery on an empty 2xx envelope (undefined), never crashing', async () => {
    // Raw @octokit/graphql yields `undefined` for a data-less 2xx body; the probe
    // must read that as "no OID" and rediscover, not throw a TypeError mid-sweep.
    const graphql = vi.fn(() => Promise.resolve(undefined));
    const request = vi.fn(() =>
      Promise.resolve({
        data: {
          path: 'README.md',
          sha: 'oid-rest',
          content: Buffer.from('# rest', 'utf8').toString('base64'),
          encoding: 'base64',
        },
      }),
    );
    const src = new OctokitReadmeSource(
      { graphql, octokit: { request } } as never,
      instantCoordinator(),
    );

    await expect(src.getReadmeRef(REPO, 'README.md')).resolves.toEqual({
      path: 'README.md',
      oid: 'oid-rest',
    });
    expect(request).toHaveBeenCalledTimes(1); // fell through to REST, no crash
  });

  it('retries a GraphQL execution timeout (HTTP 200 errors, no status), then succeeds', async () => {
    // The one transient class with NO `.status`: classifyError matches it only by the
    // message @octokit/graphql embeds. Locks that dependency against a silent regress.
    const execTimeout = Object.assign(
      new Error(
        'Request failed due to following response errors:\n - Something went wrong while executing your query.',
      ),
      {
        errors: [{ message: 'Something went wrong while executing your query. Please try again.' }],
      },
    );
    const graphql = vi
      .fn()
      .mockRejectedValueOnce(execTimeout)
      .mockResolvedValueOnce({ repository: { object: { oid: 'oid-recovered' } } });
    const request = vi.fn();
    const src = new OctokitReadmeSource(
      { graphql, octokit: { request } } as never,
      instantCoordinator(),
    );

    await expect(src.getReadmeRef(REPO, 'README.md')).resolves.toEqual({
      path: 'README.md',
      oid: 'oid-recovered',
    });
    expect(graphql).toHaveBeenCalledTimes(2);
  });

  it('exhausts the retry budget on a persistent transient fault and fails loudly', async () => {
    const graphql = vi.fn(() => Promise.reject(httpStatus(503, 'Service Unavailable')));
    const request = vi.fn();
    const src = new OctokitReadmeSource(
      { graphql, octokit: { request } } as never,
      instantCoordinator(),
    );

    await expect(src.getReadmeRef(REPO, 'README.md')).rejects.toThrow();
    expect(graphql).toHaveBeenCalledTimes(4); // DEFAULT_RETRY.maxAttempts — then it stops, no infinite loop
    expect(request).not.toHaveBeenCalled();
  });

  it('does NOT swallow a NOT_FOUND on a field other than `repository`', async () => {
    // Future-proofing: were the query to gain a second resolvable node, a NOT_FOUND
    // there must not be misread as "repository gone" and silently absorbed.
    const otherNotFound = Object.assign(new Error('Request failed'), {
      errors: [{ type: 'NOT_FOUND', path: ['viewer'], message: 'nope' }],
    });
    const graphql = vi.fn(() => Promise.reject(otherNotFound));
    const request = vi.fn();
    const src = new OctokitReadmeSource(
      { graphql, octokit: { request } } as never,
      instantCoordinator(),
    );

    await expect(src.getReadmeRef(REPO, 'README.md')).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
});
