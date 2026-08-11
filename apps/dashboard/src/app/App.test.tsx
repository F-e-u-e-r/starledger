// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LoadedDiscovery } from '../data/load-discovery';
import { DataLoadError } from '../data/load-stars';
import { makeDataset, makeRepo } from '../test-utils';
import { App } from './App';

beforeEach(() => window.history.replaceState(null, '', '/'));
afterEach(cleanup);

const discoverySource = {
  kind: 'manual',
  source_id: 'owner/repo',
  source_url: 'https://github.com/owner/repo',
  observed_at: '2026-01-01T00:00:00.000Z',
};
const discoveryFixture: LoadedDiscovery = {
  candidates: [
    {
      node_id: 'R_disc',
      owner: 'owner',
      name: 'repo',
      full_name: 'owner/repo',
      html_url: 'https://github.com/owner/repo',
      description: 'A discovery candidate',
      homepage_url: null,
      primary_language: 'TypeScript',
      stargazer_count: 100,
      archived: false,
      disabled: false,
      fork: false,
      pushed_at: '2026-01-01T00:00:00.000Z',
      discovered_at: '2026-01-15T00:00:00.000Z',
      first_seen_source: discoverySource,
      sources: [discoverySource],
      status: 'candidate',
    },
  ] as LoadedDiscovery['candidates'],
  generatedAt: '2026-01-15T00:00:00.000Z',
  candidateCount: 1,
  sourceCount: 1,
};

describe('App state machine', () => {
  it('DATA-1: renders verified repositories', async () => {
    render(
      <App
        loader={async () => makeDataset([makeRepo({ node_id: 'R_1', name_with_owner: 'a/one' })])}
      />,
    );
    await waitFor(() => expect(screen.getByText('a/one')).toBeTruthy());
    expect(screen.getByText('1 of 1 repositories')).toBeTruthy();
  });

  it('EMPTY-1: shows an empty state for zero repos (not an error)', async () => {
    render(<App loader={async () => makeDataset([])} />);
    await waitFor(() => expect(screen.getByText('No starred repositories yet.')).toBeTruthy());
  });

  it('DATA-3: an integrity failure renders an error and no repositories', async () => {
    render(
      <App
        loader={async () => {
          throw new DataLoadError('sha mismatch', 'integrity');
        }}
      />,
    );
    await waitFor(() => expect(screen.getByText('Data integrity check failed')).toBeTruthy());
    expect(screen.queryByText('repositories')).toBeNull();
  });

  it('VIEW-1: bookmarked view=discovery falls back to stars when discovery is unavailable, retaining the URL (§6.4)', async () => {
    window.history.replaceState(null, '', '/?view=discovery');
    render(
      <App
        loader={async () => makeDataset([makeRepo({ node_id: 'R_1', name_with_owner: 'a/one' })])}
        discoveryLoader={async () => null}
      />,
    );
    // effective view falls back to stars (the substrate is unavailable)
    await waitFor(() => expect(screen.getByText('a/one')).toBeTruthy());
    expect(screen.queryByRole('navigation', { name: 'Dashboard views' })).toBeNull();
    // the requested value is retained in the URL for recovery (not rewritten)
    expect(window.location.search).toBe('?view=discovery');
  });

  it('VIEW-2 (F2): empty stars + available discovery + view=discovery renders the inbox, not a dead-end EmptyState', async () => {
    window.history.replaceState(null, '', '/?view=discovery');
    render(
      <App loader={async () => makeDataset([])} discoveryLoader={async () => discoveryFixture} />,
    );
    // discovery stays reachable even with zero stars (the early return no longer wins)
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Discovery Inbox' })).toBeTruthy(),
    );
    expect(screen.queryByText('No starred repositories yet.')).toBeNull();
    expect(screen.getByRole('navigation', { name: 'Dashboard views' })).toBeTruthy();
  });

  it('VIEW-3 (F2): empty stars + available discovery keeps the tabs so discovery is reachable from the default stars view', async () => {
    render(
      <App loader={async () => makeDataset([])} discoveryLoader={async () => discoveryFixture} />,
    );
    // default view is stars → empty pane, but tabs remain (not a full-screen dead-end)
    await waitFor(() =>
      expect(screen.getByRole('navigation', { name: 'Dashboard views' })).toBeTruthy(),
    );
    expect(screen.getByText('No starred repositories yet.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Discovery Inbox/ })).toBeTruthy();
  });

  it('PAGE-reconcile (F2b): a stale ?page with an empty stars dataset canonicalizes to page 1 (App-level)', async () => {
    window.history.replaceState(null, '', '/?page=5');
    render(<App loader={async () => makeDataset([])} discoveryLoader={async () => null} />);
    await waitFor(() => expect(screen.getByText('No starred repositories yet.')).toBeTruthy());
    // RepositoryView never mounts, so App canonicalizes the inert page away
    await waitFor(() => expect(window.location.search).toBe(''));
  });

  it('PAGE-reconcile (F2b): a stale ?page on the discovery view canonicalizes to 1, keeping view', async () => {
    window.history.replaceState(null, '', '/?view=discovery&page=5');
    render(
      <App
        loader={async () => makeDataset([makeRepo({ node_id: 'R_1', name_with_owner: 'a/one' })])}
        discoveryLoader={async () => discoveryFixture}
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Discovery Inbox' })).toBeTruthy(),
    );
    await waitFor(() => expect(window.location.search).toBe('?view=discovery'));
  });
});
