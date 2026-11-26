import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { currentMonth } from "../../lib/date";

interface MonthValue {
  month: string;
  setMonth: (month: string) => void;
}

const MonthContext = createContext<MonthValue | null>(null);

/** The selected month, kept across views (ui-guidelines §2). */
export function MonthProvider({ children }: { children: ReactNode }) {
  const [month, setMonth] = useState(() => currentMonth());
  const value = useMemo(() => ({ month, setMonth }), [month]);
  return <MonthContext.Provider value={value}>{children}</MonthContext.Provider>;
}

export function useMonth(): MonthValue {
  const ctx = useContext(MonthContext);
  if (!ctx) throw new Error("useMonth must be used inside MonthProvider");
  return ctx;
}
