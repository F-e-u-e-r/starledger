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
}: {
  legend: string;
  options: Option<T>[];
  selected: readonly T[];
  onChange: (next: T[]) => void;
}) {
  if (options.length === 0) return null;
  return (
    <fieldset className="facet">
      <legend>{legend}</legend>
      <div className="facet-options">
        {options.map((opt) => (
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
  if (topics.length === 0) return null;
  const needle = filter.trim().toLowerCase();
  const visible = needle ? topics.filter((t) => t.toLowerCase().includes(needle)) : topics;
  return (
    <fieldset className="facet">
      <legend>Topics</legend>
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
    </fieldset>
  );
}

const opt = (v: string): Option<string> => ({ value: v, label: v });

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
      <CheckboxFacet
        legend="Language"
        options={facets.languages.map(opt)}
        selected={state.languages}
        onChange={(languages) => update({ languages })}
      />
      <TopicFacet
        topics={facets.topics}
        selected={state.topics}
        onChange={(topics) => update({ topics })}
      />
      <CheckboxFacet
        legend="License"
        options={facets.licenses.map(opt)}
        selected={state.licenses}
        onChange={(licenses) => update({ licenses })}
      />
      <TriStateFacet
        legend="Archived"
        value={state.archived}
        onChange={(archived) => update({ archived })}
      />
      <TriStateFacet legend="Fork" value={state.fork} onChange={(fork) => update({ fork })} />
      <TriStateFacet legend="Stale" value={state.stale} onChange={(stale) => update({ stale })} />
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
      <CheckboxFacet
        legend="Data"
        options={HYDRATION_OPTIONS}
        selected={state.hydrationStatuses}
        onChange={(hydrationStatuses) => update({ hydrationStatuses })}
      />
    </div>
  );
}
