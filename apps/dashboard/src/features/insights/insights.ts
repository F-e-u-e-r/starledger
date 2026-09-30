import type { LoadedSkillsClassification } from '../../data/load-skills-classification';
import { STALE_MONTHS, type DerivedRepo } from '../../data/derive-fields';

/**
 * M4.3a — Deterministic Insights (P7 §17). Pure aggregations over the SAME
 * `DerivedRepo[]` the dashboard already builds (`deriveAll`). Every insight is a
 * deterministic function of the CURRENT loaded snapshot — there is no longitudinal
 * store, so nothing here may claim a trend, growth, or shift over time; a
 * per-period count is "of the repos currently held, when they were starred", not a
 * historical add-rate (unstarred repos are absent from the dataset entirely).
 *
 * Each insight carries a provenance record (what was computed, from which fields,
 * by what formula) and a coverage record (how much of the dataset it reflects, on
 * which optional layer, with generation provenance for a generated layer), so the
 * UI can always explain a number and never shows an opaque score.
 */

/** What was computed and how — rendered beside every insight. */
export interface Provenance {
  method: string;
  sourceFields: string[];
  formula: string;
}

/** How much of the dataset an insight reflects. `layer` names the data source; a
 *  generated layer (`ai`/`skills`) carries its generation provenance so a viewer
 *  sees coverage and staleness, never a bare percentage. */
export interface Coverage {
  n: number;
  of: number;
  layer: 'canonical' | 'ai' | 'skills';
  generatedAt?: string;
  /** For the skills layer: the stars snapshot the classification was generated
   *  against. When it differs from the live snapshot the coverage is provenance-
   *  stale (an older, curated subset), which the UI must disclose. */
  generatedAgainstStarsSha256?: string;
  stale?: boolean;
}

export interface CategoryRow {
  category: string;
  count: number;
}

/** PC — primary-category distribution over the AI-enrichment layer. */
export interface CategoryDistribution {
  provenance: Provenance;
  coverage: Coverage;
  rows: CategoryRow[];
}

export interface MonthBucket {
  /** UTC calendar month, `YYYY-MM`. */
  month: string;
  count: number;
}

/** SA — starring activity by UTC month over currently-held stars. */
export interface StarringActivity {
  provenance: Provenance;
  coverage: Coverage;
  /** Null only when no repo carries a usable `starred_at`. */
  window: { field: 'starred_at'; from: string; to: string } | null;
  /** Contiguous, zero-filled from the first to the last month with a star. */
  buckets: MonthBucket[];
}

/** ST — stale ("forgotten") stars: upstream not pushed within the threshold. */
export interface StaleStars {
  provenance: Provenance;
  coverage: Coverage;
  staleCount: number;
  /** Repos whose push date is unknown/absent — NEVER counted as stale. */
  unknownPushCount: number;
  thresholdMonths: number;
}

/** CC — how many currently-held stars fall in the curated skills classification. */
export interface ClassificationCoverage {
  provenance: Provenance;
  coverage: Coverage;
  /** Live join: current stars carrying a classification record. */
  matched: number;
  /** Source entries the generator could not resolve to a live repo (meta). */
  unresolved: number;
  /** The classification is a curated ECOSYSTEM SUBSET — "unmatched" is outside
   *  that subset, not a coverage failure. Always true; the UI wording depends on it. */
  curatedSubset: true;
  /** The classification was generated against an older stars snapshot. */
  stale: boolean;
}

/** PC: group annotated repos by AI category; sort by count desc, then name asc.
 *  `generatedAt` is the AI layer's generation timestamp (a generated layer carries
 *  its generation provenance in `coverage`, like the skills layer). */
export function computeCategoryDistribution(
  repos: readonly DerivedRepo[],
  generatedAt?: string,
): CategoryDistribution {
  const counts = new Map<string, number>();
  let annotated = 0;
  for (const repo of repos) {
    if (repo.ai === null) continue;
    annotated += 1;
    counts.set(repo.ai.category, (counts.get(repo.ai.category) ?? 0) + 1);
  }
  const rows = [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort(
      (a, b) =>
        b.count - a.count || (a.category < b.category ? -1 : a.category > b.category ? 1 : 0),
    );
  return {
    provenance: {
      method: 'Count of your stars in each AI category',
      sourceFields: ['ai.category'],
      formula: 'group annotated repos by ai.category, count each',
    },
    coverage: { n: annotated, of: repos.length, layer: 'ai', generatedAt },
    rows,
  };
}

/** Next UTC month for a `YYYY-MM` key (for contiguous zero-fill). */
function nextMonth(ym: string): string {
  const year = Number(ym.slice(0, 4));
  const month = Number(ym.slice(5, 7)); // 1-12
  const nextY = month === 12 ? year + 1 : year;
  const nextM = month === 12 ? 1 : month + 1;
  return `${String(nextY).padStart(4, '0')}-${String(nextM).padStart(2, '0')}`;
}

/**
 * SA: bucket currently-held stars by the UTC month of `starred_at`, zero-filled
 * contiguously from the first to the last month that has a star. `starred_at` is
 * a UTC ISO instant (trailing `Z`), so the `YYYY-MM` prefix is the UTC month with
 * no local-time skew. Repos without a usable `starred_at` are excluded and the
 * window is null when none remain.
 */
export function computeStarringActivity(repos: readonly DerivedRepo[]): StarringActivity {
  const counts = new Map<string, number>();
  let counted = 0;
  for (const repo of repos) {
    const at = repo.starred_at;
    if (typeof at !== 'string') continue;
    // Strictly validate a canonical 4-digit-year UTC instant ENDING IN `Z`, then
    // require the parsed date to ROUND-TRIP to the same UTC Y/M/D. This fails CLOSED
    // on three classes the permissive schema (`starred_at: z.string().min(1)`) would
    // otherwise admit:
    //  - timezone-LESS strings (no `Z`) — they parse in the runtime's LOCAL zone, so
    //    the UTC month (and the round-trip) would be machine-dependent, breaking
    //    determinism; only a `Z` instant is accepted;
    //  - impossible dates the Date constructor silently NORMALIZES (`2026-02-30` →
    //    Mar 2) — excluded rather than misbucketed into the wrong month; and
    //  - non-4-digit (extended / negative) years — `nextMonth` slices exactly four
    //    year digits, so a `10000-01`/`-000001-01` month key the contiguous zero-fill
    //    below can never reach would loop forever. A GitHub `starred_at` is always a
    //    canonical 4-digit-year `Z` instant, so real data is unaffected.
    const m = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.exec(at);
    if (m === null) continue;
    const d = new Date(at);
    if (
      Number.isNaN(d.getTime()) ||
      d.getUTCFullYear() !== Number(m[1]) ||
      d.getUTCMonth() + 1 !== Number(m[2]) ||
      d.getUTCDate() !== Number(m[3])
    ) {
      continue;
    }
    const month = `${m[1]}-${m[2]}`;
    counts.set(month, (counts.get(month) ?? 0) + 1);
    counted += 1;
  }
  const provenance: Provenance = {
    method: 'Count of the repos you currently hold, by the UTC month you starred them',
    sourceFields: ['starred_at'],
    formula: 'group repos by starred_at UTC month (YYYY-MM), count each, zero-fill the span',
  };
  const coverage: Coverage = { n: counted, of: repos.length, layer: 'canonical' };
  if (counts.size === 0) return { provenance, coverage, window: null, buckets: [] };
  const months = [...counts.keys()].sort();
  const from = months[0]!;
  const to = months[months.length - 1]!;
  const buckets: MonthBucket[] = [];
  for (let m = from; ; m = nextMonth(m)) {
    buckets.push({ month: m, count: counts.get(m) ?? 0 });
    if (m === to) break;
  }
  return { provenance, coverage, window: { field: 'starred_at', from, to }, buckets };
}

/**
 * ST: stale ("forgotten") stars — reuses the dashboard's existing staleness
 * semantics EXACTLY (`DerivedRepo.isStale`: push date KNOWN and older than
 * `STALE_MONTHS`). An unknown/absent push date is never stale (unknown ≠ absent)
 * and is reported separately so the count is not silently understated.
 */
export function computeStaleStars(repos: readonly DerivedRepo[]): StaleStars {
  let staleCount = 0;
  let unknownPushCount = 0;
  for (const repo of repos) {
    if (repo.isStale) staleCount += 1;
    if (repo.monthsSincePush === null) unknownPushCount += 1;
  }
  return {
    provenance: {
      method: `Stars whose upstream has not pushed in over ${STALE_MONTHS} months`,
      sourceFields: ['pushed_at'],
      formula: `count repos where isStale (pushed_at known and older than ${STALE_MONTHS} months)`,
    },
    coverage: { n: repos.length - unknownPushCount, of: repos.length, layer: 'canonical' },
    staleCount,
    unknownPushCount,
    thresholdMonths: STALE_MONTHS,
  };
}

/**
 * CC: how many currently-held stars fall in the curated skills-ecosystem
 * classification. `matched` is the LIVE join (repos in the current dataset that
 * carry a classification), not the generation-time count — so it reflects the
 * dataset as loaded. The classification is a curated SUBSET generated once against
 * a (possibly older) stars snapshot; when that snapshot differs from the live one
 * the coverage is provenance-stale, which the UI discloses. `null` skills ⇒ the
 * layer is unavailable (the caller renders a degraded card).
 */
export function computeClassificationCoverage(
  repos: readonly DerivedRepo[],
  skills: LoadedSkillsClassification | null,
  currentStarsSha256: string | undefined,
): ClassificationCoverage {
  const matched = repos.reduce((n, repo) => (repo.skills !== null ? n + 1 : n), 0);
  const stale =
    skills != null &&
    currentStarsSha256 != null &&
    skills.generatedAgainstStarsSha256 !== currentStarsSha256;
  return {
    provenance: {
      method: 'How many of your current stars are in the curated skills-ecosystem classification',
      sourceFields: ['skills'],
      formula: 'count current repos carrying a classification record (live join)',
    },
    coverage: {
      n: matched,
      of: repos.length,
      layer: 'skills',
      generatedAt: skills?.generatedAt,
      generatedAgainstStarsSha256: skills?.generatedAgainstStarsSha256,
      stale,
    },
    matched,
    unresolved: skills?.coverage.unresolved ?? 0,
    curatedSubset: true,
    stale,
  };
}
