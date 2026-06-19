import type { ResolvedRepository } from './models';

/**
 * P2.3 summary boundary. The deterministic implementation is required; an LLM
 * provider is optional and can never become a required delivery dependency.
 */
export interface RepositorySummary {
  title: string;
  body: string;
}

export interface SummaryProvider {
  summarize(repository: ResolvedRepository): Promise<RepositorySummary>;
}

function formatStars(count: number | null): string {
  if (count === null) return 'Stars unknown';
  if (count < 1_000) return `${count} stars`;
  if (count < 1_000_000) return `${(count / 1_000).toFixed(count >= 100_000 ? 0 : 1)}k stars`;
  return `${(count / 1_000_000).toFixed(1)}M stars`;
}

/**
 * Stable metadata-only summary. It intentionally has no network or model
 * dependency, so notifications remain available without LLM_API_KEY.
 */
export function deterministicSummary(repository: ResolvedRepository): RepositorySummary {
  const details: string[] = [];
  if (repository.description?.trim()) details.push(repository.description.trim());

  const facts = [
    repository.primary_language ?? 'Language unknown',
    formatStars(repository.stargazer_count),
    repository.latest_release ? `Latest ${repository.latest_release.tag_name}` : null,
    repository.license_spdx ? repository.license_spdx : null,
  ].filter((value): value is string => value !== null);
  details.push(facts.join(' · '));

  const topics = repository.topics.filter(Boolean).slice(0, 8);
  if (topics.length > 0) details.push(`Topics: ${topics.join(', ')}`);
  if (repository.is_archived) details.push('Archived repository');
  if (repository.is_fork) details.push('Fork');

  return { title: repository.name_with_owner, body: details.join('\n') };
}

export class DeterministicSummaryProvider implements SummaryProvider {
  async summarize(repository: ResolvedRepository): Promise<RepositorySummary> {
    return deterministicSummary(repository);
  }
}

/**
 * Optional LLM adapter wrapper. A timeout, rejection, invalid empty result, or
 * missing adapter falls back to deterministic metadata with no run failure.
 */
export class FallbackSummaryProvider implements SummaryProvider {
  constructor(
    private readonly fallback: SummaryProvider = new DeterministicSummaryProvider(),
    private readonly llm: SummaryProvider | null = null,
    private readonly timeoutMs = 4_000,
  ) {}

  async summarize(repository: ResolvedRepository): Promise<RepositorySummary> {
    if (!this.llm) return this.fallback.summarize(repository);
    try {
      const summary = await withTimeout(this.llm.summarize(repository), this.timeoutMs);
      if (!summary.title.trim() || !summary.body.trim()) throw new Error('LLM summary was empty');
      return summary;
    } catch {
      return this.fallback.summarize(repository);
    }
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('LLM summary timed out')), timeoutMs);
    void promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
