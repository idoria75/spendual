import { useCallback, useEffect, useState } from "react";

export interface Loaded<T> {
  data: T | null;
  failed: boolean;
  reload: () => void;
}

/** Load data when the deps change. Keeps the old data while it reloads. */
export function useLoad<T>(load: () => Promise<T>, deps: readonly unknown[]): Loaded<T> {
  const [data, setData] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    let active = true;
    setFailed(false);
    load()
      .then((result) => {
        if (active) setData(result);
      })
      .catch((error: unknown) => {
        console.error(error);
        if (active) {
          setData(null);
          setFailed(true);
        }
      });
    return () => {
      active = false;
    };
  }, [...deps, tick]);

  return { data, failed, reload };
}
