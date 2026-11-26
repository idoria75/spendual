import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth/AuthContext";
import { Button } from "../components/ui/button";
import { Segmented } from "../components/ui/segmented";
import { BackupStatusRow } from "../features/settings/BackupStatusRow";
import { ExportRow } from "../features/settings/ExportRow";
import { ProfileSettings } from "../features/settings/ProfileSettings";
import { CatalogManager, type CatalogKind } from "../features/settings/CatalogManager";

export function AjustesPage() {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const [kind, setKind] = useState<CatalogKind>("categories");
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-[17px] font-bold">{t("nav.ajustes")}</h1>
      <ProfileSettings />
      <Segmented
        label={t("settings.catalogLabel")}
        value={kind}
        onChange={setKind}
        options={[
          { value: "categories", label: t("settings.categories.title") },
          { value: "accounts", label: t("settings.accounts.title") },
          { value: "paymentMethods", label: t("settings.paymentMethods.title") },
        ]}
      />
      <CatalogManager key={kind} kind={kind} />
      <ExportRow />
      <BackupStatusRow />
      <Button variant="ghost" className="self-start" onClick={() => void logout()}>
        {t("home.logout")}
      </Button>
    </section>
  );
}
