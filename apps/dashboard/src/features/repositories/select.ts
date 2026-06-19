import type { CanonicalRepo } from '@starred/schema';
import { type DerivedRepo, deriveRepo } from '../../data/derive-fields';
import type { DashboardState } from '../../state/dashboard-state';
import { applyFilters, type FilterState } from '../filters/filters';
import { buildSearchText, matchesSearchText } from '../search/search';
import { sortRepos, type SortDirection, type SortField } from '../sorting/sorting';

export interface ViewState {
  query: string;
  filters: FilterState;
  sort: { field: SortField; direction: SortDirection };
}

/** A derived repo with its normalized searchable text precomputed once. */
export interface SearchableRepo extends DerivedRepo {
  searchText: string;
}

/**
 * Per-dataset preparation (the expensive, clock-dependent half): derive fields
 * and precompute searchable text ONCE. Memoize by [repos, now]; everything after
 * this is independent of the dataset metadata and the clock.
 */
export function prepareRepositories(repos: readonly CanonicalRepo[], now: Date): SearchableRepo[] {
  return repos.map((repo) => ({ ...deriveRepo(repo, now), searchText: buildSearchText(repo) }));
}

/**
 * The per-interaction half: search → filter → sort over already-prepared repos.
 * Takes NO clock and never re-derives, so re-running it on every keystroke or
 * control change cannot redo per-repo metadata work (PERF-2).
 */
export function selectFromPrepared(
  prepared: readonly SearchableRepo[],
  view: ViewState,
): SearchableRepo[] {
  const searched = prepared.filter((repo) => matchesSearchText(repo.searchText, view.query));
  const filtered = applyFilters(searched, view.filters);
  return sortRepos(filtered, view.sort.field, view.sort.direction);
}

/** Convenience composition: prepare + select. Pure; deterministic for a fixed `now`. */
export function selectRepositories(
  repos: readonly CanonicalRepo[],
  view: ViewState,
  now: Date,
): DerivedRepo[] {
  return selectFromPrepared(prepareRepositories(repos, now), view);
}

/** Map the canonical DashboardState onto the pipeline's ViewState. */
export function dashboardToView(s: DashboardState): ViewState {
  return {
    query: s.query,
    sort: { field: s.sort, direction: s.direction },
    filters: {
      languages: s.languages,
      topics: s.topics,
      licenses: s.licenses,
      archived: s.archived,
      fork: s.fork,
      stale: s.stale,
      stableRelease: s.stableRelease,
      anyRelease: s.anyRelease,
      hydrationStatuses: s.hydrationStatuses,
    },
  };
}

export interface FacetOptions {
  languages: string[];
  topics: string[];
  licenses: string[];
}

/** Facet option lists derived from the dataset (so they track the data, not a hardcoded list). */
export function deriveFacetOptions(repos: readonly CanonicalRepo[]): FacetOptions {
  const languages = new Set<string>();
  const topics = new Set<string>();
  const licenses = new Set<string>();
  for (const repo of repos) {
    if (repo.primary_language) languages.add(repo.primary_language);
    for (const topic of repo.topics) topics.add(topic);
    if (repo.license_spdx) licenses.add(repo.license_spdx);
  }
  const sorted = (set: Set<string>) => [...set].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return { languages: sorted(languages), topics: sorted(topics), licenses: sorted(licenses) };
}
