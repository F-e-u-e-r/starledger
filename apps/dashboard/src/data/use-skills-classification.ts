import { useEffect, useState } from 'react';
import {
  type LoadedSkillsClassification,
  type SkillsClassificationStatus,
  loadSkillsClassification,
} from './load-skills-classification';

export interface SkillsClassificationState {
  status: SkillsClassificationStatus;
  data: LoadedSkillsClassification | null;
}

/**
 * Availability-state hook for the optional skills-classification layer
 * (P7 §4.10). Locked decision 1: `loading` from mount until the loader
 * settles — NEVER mislabeled `unavailable` while in flight; `unavailable`
 * only after a definitive failure (loader resolved `null` or rejected).
 *
 * M2.3 keeps the production UI delta at zero: App invokes this hook so the
 * layer exists at runtime and its lifecycle is tested, but nothing consumes
 * the state yet — M2.4 projects it into scope/facets/badges.
 */
export function useSkillsClassification(
  loader?: () => Promise<LoadedSkillsClassification | null>,
): SkillsClassificationState {
  const [state, setState] = useState<SkillsClassificationState>({
    status: 'loading',
    data: null,
  });

  useEffect(() => {
    const load = loader ?? (() => loadSkillsClassification({ base: import.meta.env.BASE_URL }));
    let active = true;
    // A replaced loader restarts the lifecycle: back to `loading` FIRST, so a
    // stale ready/unavailable never shows while the new load is in flight
    // (locked decision 1; review finding K4). Promise.resolve().then(load)
    // also routes a synchronous loader throw into the rejection path.
    // The reset is IDEMPOTENT (functional update returning the same reference
    // when already pristine-loading) so React bails out instead of
    // re-rendering — a referentially unstable loader can then never drive a
    // synchronous effect↔render loop. Callers should still pass a stable
    // loader; that is the ordinary useEffect-dependency contract.
    setState((previous) =>
      previous.status === 'loading' && previous.data === null
        ? previous
        : { status: 'loading', data: null },
    );
    Promise.resolve()
      .then(() => load())
      .then(
        (data) => {
          if (!active) return;
          setState(data ? { status: 'ready', data } : { status: 'unavailable', data: null });
        },
        () => {
          if (active) setState({ status: 'unavailable', data: null });
        },
      );
    return () => {
      active = false;
    };
  }, [loader]);

  return state;
}
