import { useMemo, useRef, useState } from 'react';
import type { CanonicalRepo } from '@starred/schema';
import { NoResults } from '../../components/states';
import { useDashboardState } from '../../state/use-dashboard-state';
import { FilterChips } from '../filters/FilterChips';
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
  initialNow,
}: {
  repos: CanonicalRepo[];
  initialNow?: Date;
}) {
  const { state, update, reset } = useDashboardState();
  const [sessionNow] = useState(() => initialNow ?? new Date());

  const prepared = useMemo(() => prepareRepositories(repos, sessionNow), [repos, sessionNow]);
  const facets = useMemo(() => deriveFacetOptions(repos), [repos]);
  const results = useMemo(
    () => selectFromPrepared(prepared, dashboardToView(state)),
    [prepared, state],
  );

  // Stable focus target so chip removal / clear-all never drop focus to <body>.
  const resultsHeadingRef = useRef<HTMLHeadingElement>(null);
  const focusResults = () => resultsHeadingRef.current?.focus();

  return (
    <main className="dashboard">
      <header className="dashboard-head">
        <h1>Starred repositories</h1>
        <div className="toolbar">
          <label className="search">
            <span className="visually-hidden">Search repositories</span>
            <input
              type="search"
              value={state.query}
              onChange={(e) => update({ query: e.target.value }, 'replace')}
              placeholder="Search name, description, topic, language"
            />
          </label>
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
            Results
          </h2>

          <FilterChips
            state={state}
            update={update}
            onClearAll={() => reset()}
            onAfterRemove={focusResults}
          />

          <p className="result-count" role="status">
            {results.length} of {repos.length} repositories
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
                <RepositoryCard key={repo.node_id} repo={repo} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
