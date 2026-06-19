import type { CanonicalRepo } from '@starred/schema';

/** Lowercase + NFKD-normalize + trim, for accent/width-insensitive substring search. */
export function normalizeText(text: string): string {
  return text.normalize('NFKD').toLowerCase().trim();
}

function repoSearchText(repo: CanonicalRepo): string {
  return [
    repo.name_with_owner,
    repo.description ?? '',
    repo.topics.join(' '),
    repo.primary_language ?? '',
  ].join(' ');
}

/**
 * Precompute a repo's normalized searchable text. Done ONCE per dataset so the
 * hot path (one call per keystroke per repo) is a plain substring check.
 */
export function buildSearchText(repo: CanonicalRepo): string {
  return normalizeText(repoSearchText(repo));
}

/** Match precomputed (already-normalized) text against a query. Empty/whitespace query matches all. */
export function matchesSearchText(searchText: string, query: string): boolean {
  const q = normalizeText(query);
  return q.length === 0 || searchText.includes(q);
}

/**
 * Substring match over name_with_owner / description / topics / language. Empty
 * query matches all. Normalizes the repo on each call — prefer
 * {@link buildSearchText} + {@link matchesSearchText} on hot paths.
 */
export function matchesQuery(repo: CanonicalRepo, query: string): boolean {
  return matchesSearchText(buildSearchText(repo), query);
}
