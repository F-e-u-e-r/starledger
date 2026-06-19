import { useId, useState } from 'react';
import type { ReleaseAvailability } from '../../data/derive-fields';
import type { BooleanFilter, DashboardState, HydrationStatus } from '../../state/dashboard-state';
import type { HistoryMode } from '../../state/use-dashboard-state';
import type { FacetOptions } from '../repositories/select';

type Option<T extends string> = { value: T; label: string };

const RELEASE_OPTIONS: Option<ReleaseAvailability>[] = [
  { value: 'has', label: 'Has release' },
  { value: 'none', label: 'No release' },
  { value: 'unavailable', label: 'Unavailable' },
];
const HYDRATION_OPTIONS: Option<HydrationStatus>[] = [
  { value: 'ok', label: 'OK' },
  { value: 'partial', label: 'Partial' },
  { value: 'failed', label: 'Failed' },
];
const BOOLEAN_OPTIONS: { value: BooleanFilter; label: string }[] = [
  { value: null, label: 'All' },
  { value: true, label: 'Yes' },
  { value: false, label: 'No' },
];

function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** Multi-select facet (OR within the facet). Renders nothing when there are no options. */
function CheckboxFacet<T extends string>({
  legend,
  options,
  selected,
  onChange,
  initialLimit,
  hideLegend = false,
}: {
  legend: string;
  options: Option<T>[];
  selected: readonly T[];
  onChange: (next: T[]) => void;
  initialLimit?: number;
  hideLegend?: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  if (options.length === 0) return null;
  const limited = initialLimit && !showAll ? options.slice(0, initialLimit) : options;
  const selectedOverflow =
    initialLimit && !showAll
      ? options.filter(
          (opt) => selected.includes(opt.value) && !limited.some((v) => v.value === opt.value),
        )
      : [];
  const visible = [...limited, ...selectedOverflow];
  const hiddenCount = options.length - visible.length;
  return (
    <fieldset className="facet">
      <legend className={hideLegend ? 'visually-hidden' : undefined}>{legend}</legend>
      <div className="facet-options">
        {visible.map((opt) => (
          <label key={opt.value} className="facet-option">
            <input
              type="checkbox"
              checked={selected.includes(opt.value)}
              onChange={() => onChange(toggle(selected, opt.value))}
            />
            {opt.label}
          </label>
        ))}
      </div>
      {hiddenCount > 0 ? (
        <button type="button" className="facet-more" onClick={() => setShowAll(true)}>
          Show {hiddenCount} more
        </button>
      ) : null}
    </fieldset>
  );
}

/** Tri-state All / Yes / No facet. */
function TriStateFacet({
  legend,
  value,
  onChange,
}: {
  legend: string;
  value: BooleanFilter;
  onChange: (next: BooleanFilter) => void;
}) {
  const name = useId();
  return (
    <fieldset className="facet">
      <legend>{legend}</legend>
      <div className="facet-options">
        {BOOLEAN_OPTIONS.map((opt) => (
          <label key={String(opt.value)} className="facet-option">
            <input
              type="radio"
              name={name}
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
            />
            {opt.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Topic facet: a long list, so a client-side filter narrows the visible checkboxes. */
function TopicFacet({
  topics,
  selected,
  onChange,
}: {
  topics: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [filter, setFilter] = useState('');
  const [showAll, setShowAll] = useState(false);
  if (topics.length === 0) return null;
  const needle = filter.trim().toLowerCase();
  const matching = needle ? topics.filter((t) => t.toLowerCase().includes(needle)) : topics;
  const limited = showAll ? matching : matching.slice(0, 12);
  const selectedOverflow = showAll
    ? []
    : matching.filter((t) => selected.includes(t) && !limited.includes(t));
  const visible = [...limited, ...selectedOverflow];
  const hiddenCount = matching.length - visible.length;
  return (
    <fieldset className="facet">
      <legend className="visually-hidden">Topics</legend>
      <label className="facet-filter">
        <span className="visually-hidden">Filter topics</span>
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter topics…"
        />
      </label>
      <div className="facet-options facet-options--scroll">
        {visible.map((t) => (
          <label key={t} className="facet-option">
            <input
              type="checkbox"
              checked={selected.includes(t)}
              onChange={() => onChange(toggle(selected, t))}
            />
            {t}
          </label>
        ))}
        {visible.length === 0 ? <p className="facet-empty">No matching topics</p> : null}
      </div>
      {hiddenCount > 0 ? (
        <button type="button" className="facet-more" onClick={() => setShowAll(true)}>
          Show {hiddenCount} more
        </button>
      ) : null}
    </fieldset>
  );
}

const opt = (v: string): Option<string> => ({ value: v, label: v });

function FilterSection({
  title,
  count,
  defaultOpen,
  children,
}: {
  title: string;
  count: number;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  return (
    <section className="filter-section">
      <button
        type="button"
        className="filter-section-trigger"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{title}</span>
        <span className="filter-section-count">{count} options</span>
        <span aria-hidden="true" className="filter-section-chevron">
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open ? (
        <div id={bodyId} className="filter-section-body">
          {children}
        </div>
      ) : null}
    </section>
  );
}

/**
 * Every supported P1 facet. Semantics: AND across facets, OR within a facet.
 * Facet changes are discrete actions and push a history entry by default.
 */
export function FilterControls({
  state,
  facets,
  update,
}: {
  state: DashboardState;
  facets: FacetOptions;
  update: (partial: Partial<DashboardState>, mode?: HistoryMode) => void;
}) {
  return (
    <div className="filters">
      <FilterSection title="Language" count={facets.languages.length} defaultOpen>
        <CheckboxFacet
          legend="Language"
          options={facets.languages.map(opt)}
          selected={state.languages}
          onChange={(languages) => update({ languages })}
          initialLimit={10}
          hideLegend
        />
      </FilterSection>
      <FilterSection title="Topics" count={facets.topics.length} defaultOpen={false}>
        <TopicFacet
          topics={facets.topics}
          selected={state.topics}
          onChange={(topics) => update({ topics })}
        />
      </FilterSection>
      <FilterSection title="License" count={facets.licenses.length} defaultOpen={false}>
        <CheckboxFacet
          legend="License"
          options={facets.licenses.map(opt)}
          selected={state.licenses}
          onChange={(licenses) => update({ licenses })}
          initialLimit={10}
          hideLegend
        />
      </FilterSection>
      <FilterSection title="Repository type" count={3} defaultOpen>
        <TriStateFacet
          legend="Archived"
          value={state.archived}
          onChange={(archived) => update({ archived })}
        />
        <TriStateFacet legend="Fork" value={state.fork} onChange={(fork) => update({ fork })} />
        <TriStateFacet legend="Stale" value={state.stale} onChange={(stale) => update({ stale })} />
      </FilterSection>
      <FilterSection title="Release status" count={RELEASE_OPTIONS.length * 2} defaultOpen>
        <CheckboxFacet
          legend="Stable release"
          options={RELEASE_OPTIONS}
          selected={state.stableRelease}
          onChange={(stableRelease) => update({ stableRelease })}
        />
        <CheckboxFacet
          legend="Any release"
          options={RELEASE_OPTIONS}
          selected={state.anyRelease}
          onChange={(anyRelease) => update({ anyRelease })}
        />
      </FilterSection>
      <FilterSection title="Data status" count={HYDRATION_OPTIONS.length} defaultOpen={false}>
        <CheckboxFacet
          legend="Data"
          options={HYDRATION_OPTIONS}
          selected={state.hydrationStatuses}
          onChange={(hydrationStatuses) => update({ hydrationStatuses })}
          hideLegend
        />
      </FilterSection>
    </div>
  );
}
