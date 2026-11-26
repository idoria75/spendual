import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { fetchSetup } from "../planning/api";

export const SETUP_PATH = "/configuracao";

const SetupContext = createContext<{ markCompleted: () => void } | null>(null);

export function useSetup(): { markCompleted: () => void } {
  const ctx = useContext(SetupContext);
  if (!ctx) throw new Error("useSetup must be used inside SetupGate");
  return ctx;
}

/**
 * Route guard: until the household setup is completed, every signed-in page redirects to the
 * setup page. If the status cannot be read, the app opens normally (never lock the user out).
 */
export function SetupGate() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const [completed, setCompleted] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    fetchSetup()
      .then((s) => active && setCompleted(s.completed))
      .catch(() => active && setCompleted(true));
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo(() => ({ markCompleted: () => setCompleted(true) }), []);

  if (completed === null) {
    return (
      <p role="status" className="p-4 text-muted">
        {t("common.loading")}
      </p>
    );
  }
  if (!completed && pathname !== SETUP_PATH) return <Navigate to={SETUP_PATH} replace />;
  if (completed && pathname === SETUP_PATH) return <Navigate to="/" replace />;
  return (
    <SetupContext.Provider value={value}>
      <Outlet />
    </SetupContext.Provider>
  );
}
