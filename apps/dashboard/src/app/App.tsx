import { useEffect, useState } from 'react';
import { EmptyState, ErrorState, Loading } from '../components/states';
import {
  type DataLoadKind,
  DataLoadError,
  type LoadedDataset,
  loadStars,
} from '../data/load-stars';
import { RepositoryView } from '../features/repositories/RepositoryView';

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

  return (
    <RepositoryView
      repos={state.data.stars.repos}
      datasetGeneratedAt={state.data.meta.dataset_generated_at}
    />
  );
}
