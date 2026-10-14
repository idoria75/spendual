import { useTranslation } from "react-i18next";
import { useAuth } from "../auth/AuthContext";
import { Button } from "../components/ui/button";

/** Placeholder until the dashboard exists (Phase 4). */
export function HomePage() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  return (
    <main className="mx-auto flex max-w-[640px] flex-col gap-3 p-4">
      <h1 className="text-[17px] font-bold">{t("home.title")}</h1>
      <p>{t("home.welcome", { name: user?.displayName ?? "" })}</p>
      <p className="text-muted">{t("home.placeholder")}</p>
      <Button variant="ghost" className="self-start" onClick={() => void logout()}>
        {t("home.logout")}
      </Button>
    </main>
  );
}
