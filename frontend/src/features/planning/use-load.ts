import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export interface Loaded<T> {
  data: T | null;
  failed: boolean;
  reload: () => void;
}

/**
 * Load data when the deps change. Data of other deps is never returned (no stale month).
 * A reload with the same deps keeps the data until the new data arrives.
 */
export function useLoad<T>(load: () => Promise<T>, deps: readonly unknown[]): Loaded<T> {
  const key = JSON.stringify(deps);
  const [loaded, setLoaded] = useState<{ key: string; data: T } | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  // The caller passes a new closure each render; only the deps (as `key`) decide when to load.
  const loadRef = useRef(load);
  useLayoutEffect(() => {
    loadRef.current = load;
  });
  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    let active = true;
    setFailedKey(null);
    loadRef
      .current()
      .then((result) => {
        if (active) setLoaded({ key, data: result });
      })
      .catch((error: unknown) => {
        console.error(error);
        if (active) {
          setLoaded(null);
          setFailedKey(key);
        }
      });
    return () => {
      active = false;
    };
  }, [key, tick]);

  return {
    data: loaded?.key === key ? loaded.data : null,
    failed: failedKey === key,
    reload,
  };
}
