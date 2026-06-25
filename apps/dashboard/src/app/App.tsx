import { useEffect, useState } from 'react';
import { EmptyState, ErrorState, Loading } from '../components/states';
import { type LoadedAnnotations, loadAnnotations } from '../data/load-annotations';
import { type LoadedDiscovery, loadDiscovery } from '../data/load-discovery';
import {
  type DataLoadKind,
  DataLoadError,
  type LoadedDataset,
  loadStars,
} from '../data/load-stars';
import { DiscoveryInbox } from '../features/discovery/DiscoveryInbox';
import { RepositoryView } from '../features/repositories/RepositoryView';

type State =
  | { status: 'loading' }
  | { status: 'error'; kind: DataLoadKind | 'unknown'; message: string }
  | { status: 'loaded'; data: LoadedDataset };

type ActiveView = 'stars' | 'discovery';

export interface AppProps {
  /** Injectable for tests; defaults to loading from the Pages base path. */
  loader?: () => Promise<LoadedDataset>;
  /** Injectable for tests; the optional, fail-soft AI enrichment loader. */
  annotationsLoader?: () => Promise<LoadedAnnotations | null>;
  /** Injectable for tests; the optional, fail-soft discovery inbox loader. */
  discoveryLoader?: () => Promise<LoadedDiscovery | null>;
}

export function App({ loader, annotationsLoader, discoveryLoader }: AppProps = {}) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [annotations, setAnnotations] = useState<LoadedAnnotations | null>(null);
  const [discovery, setDiscovery] = useState<LoadedDiscovery | null>(null);
  const [activeView, setActiveView] = useState<ActiveView>('stars');

  useEffect(() => {
    const load = loader ?? (() => loadStars({ base: import.meta.env.BASE_URL }));
    const loadAnn =
      annotationsLoader ?? (() => loadAnnotations({ base: import.meta.env.BASE_URL }));
    const loadDisc = discoveryLoader ?? (() => loadDiscovery({ base: import.meta.env.BASE_URL }));
    let active = true;
    load().then(
      (data) => {
        if (!active) return;
        setState({ status: 'loaded', data });
        // Optional AI enrichment loads AFTER canonical success and is fail-soft:
        // any problem resolves to `null` and never blocks or errors the dashboard.
        loadAnn().then(
          (ann) => {
            if (active) setAnnotations(ann);
          },
          () => {
            if (active) setAnnotations(null);
          },
        );
        // Optional discovery inbox — same fail-soft pattern as AI enrichment.
        loadDisc().then(
          (disc) => {
            if (active) setDiscovery(disc);
          },
          () => {
            if (active) setDiscovery(null);
          },
        );
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
  }, [loader, annotationsLoader, discoveryLoader]);

  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') return <ErrorState kind={state.kind} message={state.message} />;
  if (state.data.stars.repos.length === 0) return <EmptyState />;

  return (
    <>
      {discovery && discovery.candidates.length > 0 ? (
        <nav className="view-tabs" aria-label="Dashboard views">
          <button
            type="button"
            className={`view-tab${activeView === 'stars' ? ' view-tab--active' : ''}`}
            onClick={() => setActiveView('stars')}
            aria-current={activeView === 'stars' ? 'page' : undefined}
          >
            Starred
          </button>
          <button
            type="button"
            className={`view-tab${activeView === 'discovery' ? ' view-tab--active' : ''}`}
            onClick={() => setActiveView('discovery')}
            aria-current={activeView === 'discovery' ? 'page' : undefined}
          >
            Discovery Inbox
            <span className="view-tab-count">{discovery.candidateCount}</span>
          </button>
        </nav>
      ) : null}

      {activeView === 'stars' ? (
        <RepositoryView
          repos={state.data.stars.repos}
          datasetGeneratedAt={state.data.meta.dataset_generated_at}
          annotations={annotations}
        />
      ) : discovery ? (
        <DiscoveryInbox discovery={discovery} />
      ) : null}
    </>
  );
}
