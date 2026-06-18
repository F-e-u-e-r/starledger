import { useEffect, useState } from 'react';
import { EmptyState, ErrorState, Loading } from '../components/states';
import {
  type DataLoadKind,
  DataLoadError,
  type LoadedDataset,
  loadStars,
} from '../data/load-stars';

type State =
  | { status: 'loading' }
  | { status: 'error'; kind: DataLoadKind | 'unknown'; message: string }
  | { status: 'loaded'; data: LoadedDataset };

export interface AppProps {
  /** Injectable for tests; defaults to loading from the Pages base path. */
  loader?: () => Promise<LoadedDataset>;
}

export function App({ loader }: AppProps = {}) {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    const load = loader ?? (() => loadStars({ base: import.meta.env.BASE_URL }));
    let active = true;
    load().then(
      (data) => {
        if (active) setState({ status: 'loaded', data });
      },
      (err: unknown) => {
        if (!active) return;
        const kind = err instanceof DataLoadError ? err.kind : 'unknown';
        const message = err instanceof Error ? err.message : String(err);
        setState({ status: 'error', kind, message });
      },
    );
    return () => {
      active = false;
    };
  }, [loader]);

  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') return <ErrorState kind={state.kind} message={state.message} />;
  if (state.data.stars.repos.length === 0) return <EmptyState />;

  // P1.1 renders a minimal verified list; search/sort/filter/cards arrive in P1.2/P1.3.
  const repos = state.data.stars.repos;
  return (
    <main>
      <h1>Starred repositories</h1>
      <p>{repos.length} repositories</p>
      <ul>
        {repos.map((repo) => (
          <li key={repo.node_id}>
            <a href={repo.url}>{repo.name_with_owner}</a>
            {repo.primary_language ? <span> · {repo.primary_language}</span> : null}
          </li>
        ))}
      </ul>
    </main>
  );
}
