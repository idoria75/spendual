import { useTranslation } from "react-i18next";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./AuthContext";

export function ProtectedRoute() {
  const { status } = useAuth();
  const { t } = useTranslation();
  if (status === "loading") {
    return (
      <p role="status" className="p-4 text-muted">
        {t("common.loading")}
      </p>
    );
  }
  if (status === "anonymous") return <Navigate to="/entrar" replace />;
  return <Outlet />;
}
