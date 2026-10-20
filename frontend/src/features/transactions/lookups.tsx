import type { Lookups } from "@spendual/shared";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { fetchLookups } from "./api";

interface LookupsValue {
  /** null while loading or after a failed load. */
  data: Lookups | null;
  failed: boolean;
  reload: () => Promise<void>;
}

const LookupsContext = createContext<LookupsValue | null>(null);

export function LookupsProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Lookups | null>(null);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    try {
      setData(await fetchLookups());
      setFailed(false);
    } catch (error) {
      console.error(error);
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const value = useMemo(() => ({ data, failed, reload }), [data, failed, reload]);
  return <LookupsContext.Provider value={value}>{children}</LookupsContext.Provider>;
}

export function useLookups(): LookupsValue {
  const ctx = useContext(LookupsContext);
  if (!ctx) throw new Error("useLookups must be used inside LookupsProvider");
  return ctx;
}

/** Most used first, then by name. The order of every category picker in the entry flow. */
export const byUsage = (
  a: { usageCount: number; name: string },
  b: { usageCount: number; name: string },
): number => b.usageCount - a.usageCount || a.name.localeCompare(b.name, "pt-BR");
