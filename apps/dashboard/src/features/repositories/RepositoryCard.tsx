import type { DerivedRepo, ReleaseAvailability } from '../../data/derive-fields';

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function unavailable(repo: DerivedRepo, field: string): boolean {
  return (repo.unavailable_fields as readonly string[]).includes(field);
}

/** A metadata row that distinguishes unknown (unavailable) from confirmed-absent. */
function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="meta">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

const UNKNOWN = <span className="unknown">Information unavailable</span>;

function ReleaseValue({
  availability,
  tag,
  date,
  kind,
}: {
  availability: ReleaseAvailability;
  tag: string | null;
  date: string | null;
  kind: string;
}) {
  if (availability === 'unavailable') return UNKNOWN;
  if (availability === 'none') return <span className="none">{`No ${kind} release`}</span>;
  return (
    <span>
      {tag}
      {date ? <span className="muted"> · {date}</span> : null}
    </span>
  );
}

/**
 * One responsive repository entry. A field that is `null` but NOT in
 * `unavailable_fields` renders as confirmed-absent ("None" / "No release"); a
 * field listed as unavailable renders as "Information unavailable" — the two are
 * never conflated (DATA-4 / CARD-1).
 */
export function RepositoryCard({ repo }: { repo: DerivedRepo }) {
  const starred = fmtDate(repo.starred_at);
  const pushed = unavailable(repo, 'pushed_at')
    ? UNKNOWN
    : (fmtDate(repo.pushed_at) ?? <span className="none">—</span>);
  const degraded = repo.hydration_status !== 'ok';

  return (
    <li className="card">
      <div className="card-head">
        <h3 className="card-title">
          <a href={repo.url}>{repo.name_with_owner}</a>
        </h3>
        <span className="badges">
          {repo.is_archived === true ? (
            <span className="badge badge-archived">Archived</span>
          ) : null}
          {repo.is_fork === true ? <span className="badge badge-fork">Fork</span> : null}
          {degraded ? (
            <span className="badge badge-degraded">
              {repo.hydration_status === 'failed' ? 'Data unavailable' : 'Partial data'}
            </span>
          ) : null}
        </span>
      </div>

      {repo.description ? <p className="card-desc">{repo.description}</p> : null}

      {repo.topics.length > 0 ? (
        <ul className="topics" aria-label="Topics">
          {repo.topics.map((t) => (
            <li key={t} className="topic">
              {t}
            </li>
          ))}
        </ul>
      ) : null}

      <dl className="meta-grid">
        <Meta label="Language">
          {unavailable(repo, 'primary_language')
            ? UNKNOWN
            : (repo.primary_language ?? <span className="none">—</span>)}
        </Meta>
        <Meta label="Stars">
          {unavailable(repo, 'stargazer_count') ? UNKNOWN : `★ ${repo.stargazer_count ?? 0}`}
        </Meta>
        <Meta label="License">
          {unavailable(repo, 'license_spdx')
            ? UNKNOWN
            : (repo.license_spdx ?? <span className="none">None</span>)}
        </Meta>
        <Meta label="Starred">{starred ?? <span className="none">—</span>}</Meta>
        <Meta label="Pushed">{pushed}</Meta>
        <Meta label="Stable release">
          <ReleaseValue
            availability={repo.stableRelease}
            tag={repo.latest_stable_release?.tag_name ?? null}
            date={fmtDate(repo.latest_stable_release?.published_at ?? null)}
            kind="stable"
          />
        </Meta>
        <Meta label="Latest release">
          <ReleaseValue
            availability={repo.anyRelease}
            tag={repo.latest_any_release?.tag_name ?? null}
            date={fmtDate(repo.latest_any_release?.published_at ?? null)}
            kind="latest"
          />
        </Meta>
      </dl>
    </li>
  );
}
