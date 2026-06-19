import { useId, useMemo, useRef, useState } from 'react';
import type { CanonicalRepo } from '@starred/schema';
import { NoResults } from '../../components/states';
import { useDashboardState } from '../../state/use-dashboard-state';
import { activeFilterCount, FilterChips } from '../filters/FilterChips';
import { FilterControls } from '../filters/FilterControls';
import { SORT_FIELDS, type SortField } from '../sorting/sorting';
import { RepositoryCard } from './RepositoryCard';
import {
  dashboardToView,
  deriveFacetOptions,
  prepareRepositories,
  selectFromPrepared,
} from './select';

const SORT_LABELS: Record<SortField, string> = {
  starred_at: 'Recently starred',
  stargazer_count: 'Stars',
  pushed_at: 'Recently pushed',
  latest_stable_release: 'Latest stable release',
  name_with_owner: 'Name',
};

function formatLastSynced(iso: string | undefined, now: Date): string {
  if (!iso) return 'Last synced unavailable';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Last synced unavailable';
  const diffMs = now.getTime() - d.getTime();
  if (diffMs < 0) return `Last synced ${d.toISOString().slice(0, 10)}`;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'Last synced just now';
  if (minutes < 60) return `Last synced ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Last synced ${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Last synced ${days} day${days === 1 ? '' : 's'} ago`;
  return `Last synced ${d.toISOString().slice(0, 10)}`;
}

function resultContext(count: number, total: number, query: string): string {
  const q = query.trim();
  if (!q) return `${count} of ${total} repositories`;
  return `${count} result${count === 1 ? '' : 's'} for "${q}"`;
}

/**
 * The full P1.3 dashboard: URL-synced canonical state, every facet control,
 * active-filter chips, a responsive card list and accessible result states.
 *
 * Performance: per-dataset work (`prepareRepositories` = derive + searchable
 * text, and `deriveFacetOptions`) is memoized by [repos, sessionNow]; only the
 * cheap search/filter/sort pass re-runs as the dashboard state changes.
 */
export function RepositoryView({
  repos,
  datasetGeneratedAt,
  initialNow,
}: {
  repos: CanonicalRepo[];
  datasetGeneratedAt?: string;
  initialNow?: Date;
}) {
  const { state, update, reset } = useDashboardState();
  const [sessionNow] = useState(() => initialNow ?? new Date());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const searchId = useId();

  const prepared = useMemo(() => prepareRepositories(repos, sessionNow), [repos, sessionNow]);
  const facets = useMemo(() => deriveFacetOptions(repos), [repos]);
  const results = useMemo(
    () => selectFromPrepared(prepared, dashboardToView(state)),
    [prepared, state],
  );

  // Stable focus target so chip removal / clear-all never drop focus to <body>.
  const resultsHeadingRef = useRef<HTMLHeadingElement>(null);
  const focusResults = () => resultsHeadingRef.current?.focus();
  const filterCount = activeFilterCount(state);
  const trimmedQuery = state.query.trim();

  return (
    <main className="dashboard">
      <header className="dashboard-head">
        <div className="brand-row">
          <div>
            <h1>StarLedger</h1>
            <p>Browse and organize your GitHub stars</p>
          </div>
          <p className="dataset-status">
            {repos.length} starred repositories · {formatLastSynced(datasetGeneratedAt, sessionNow)}
          </p>
        </div>
        <div className="toolbar">
          <div className="search">
            <label className="visually-hidden" htmlFor={searchId}>
              Search repositories
            </label>
            <input
              id={searchId}
              type="search"
              value={state.query}
              onChange={(e) => update({ query: e.target.value }, 'replace')}
              placeholder="Search by repository, description, topic, or language..."
            />
            {state.query ? (
              <button
                type="button"
                className="search-clear"
                aria-label="Clear search"
                onClick={() => update({ query: '' }, 'replace')}
              >
                ×
              </button>
            ) : null}
          </div>
          <button
            type="button"
            className="filters-toggle"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen(true)}
          >
            Filters{filterCount > 0 ? ` ${filterCount}` : ''}
          </button>
          <label className="sort">
            <span>Sort</span>
            <select
              value={state.sort}
              onChange={(e) => update({ sort: e.target.value as SortField })}
            >
              {SORT_FIELDS.map((field) => (
                <option key={field} value={field}>
                  {SORT_LABELS[field]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => update({ direction: state.direction === 'asc' ? 'desc' : 'asc' })}
            aria-label={`Sort direction: ${state.direction === 'asc' ? 'ascending' : 'descending'}. Activate to toggle.`}
          >
            {state.direction === 'asc' ? '↑ Ascending' : '↓ Descending'}
          </button>
        </div>
      </header>

      <div className="layout">
        <aside className="sidebar" aria-label="Filters">
          <FilterControls state={state} facets={facets} update={update} />
        </aside>

        <section className="results" aria-labelledby="results-heading">
          <h2
            id="results-heading"
            tabIndex={-1}
            ref={resultsHeadingRef}
            className="results-heading"
          >
            Starred repositories
          </h2>

          <FilterChips
            state={state}
            update={update}
            onClearAll={() => reset()}
            onAfterRemove={focusResults}
          />

          <p className="result-count" role="status">
            <span>{resultContext(results.length, repos.length, state.query)}</span>
            {trimmedQuery ? (
              <span className="result-total">
                {results.length} of {repos.length} repositories
              </span>
            ) : null}
          </p>

          {results.length === 0 ? (
            <NoResults
              onClearFilters={() => {
                reset();
                focusResults();
              }}
            />
          ) : (
            <ul className="card-list">
              {results.map((repo) => (
                <RepositoryCard key={repo.node_id} repo={repo} now={sessionNow} />
              ))}
            </ul>
          )}
        </section>
      </div>

      {filtersOpen ? (
        <div className="drawer-backdrop" role="presentation">
          <div className="filter-drawer" role="dialog" aria-modal="true" aria-label="Filters">
            <div className="drawer-head">
              <h2>Filters</h2>
              <button
                type="button"
                onClick={() => setFiltersOpen(false)}
                aria-label="Close filters"
              >
                ×
              </button>
            </div>
            <FilterControls state={state} facets={facets} update={update} />
          </div>
        </div>
      ) : null}
    </main>
  );
}
