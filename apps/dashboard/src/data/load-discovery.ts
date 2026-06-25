import {
  type DiscoveryCandidate,
  DiscoveryCandidatesFileSchema,
  DiscoveryCandidatesMetaSchema,
} from '@starred/discovery/contracts';

export interface LoadedDiscovery {
  candidates: DiscoveryCandidate[];
  generatedAt: string;
  candidateCount: number;
  sourceCount: number;
}

export interface DiscoveryLoadOptions {
  base?: string;
  fetchImpl?: typeof fetch;
  verifyBytes?: boolean;
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function loadDiscovery(
  opts: DiscoveryLoadOptions = {},
): Promise<LoadedDiscovery | null> {
  const base = opts.base ?? '/';
  const doFetch = opts.fetchImpl ?? fetch;
  try {
    const metaRes = await doFetch(`${base}discovery-candidates-meta.json`, { cache: 'no-cache' });
    if (!metaRes.ok) return null;
    const metaParsed = DiscoveryCandidatesMetaSchema.safeParse(await metaRes.json());
    if (!metaParsed.success) return null;
    const meta = metaParsed.data;

    const candidatesRes = await doFetch(`${base}discovery-candidates.json?sha=${meta.dataset_sha}`);
    if (!candidatesRes.ok) return null;
    const candidatesText = await candidatesRes.text();

    if (opts.verifyBytes !== false && (await sha256Hex(candidatesText)) !== meta.dataset_sha) {
      return null;
    }

    let json: unknown;
    try {
      json = JSON.parse(candidatesText);
    } catch {
      return null;
    }
    const candidatesParsed = DiscoveryCandidatesFileSchema.safeParse(json);
    if (!candidatesParsed.success) return null;

    if (candidatesParsed.data.candidates.length !== meta.candidate_count) return null;

    return {
      candidates: candidatesParsed.data.candidates,
      generatedAt: meta.generated_at,
      candidateCount: meta.candidate_count,
      sourceCount: meta.source_count,
    };
  } catch {
    return null;
  }
}
