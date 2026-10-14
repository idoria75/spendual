import { useTranslation } from "react-i18next";
import { formatBytes } from "../../lib/bytes";
import { formatDateTime } from "../../lib/date";
import { useLoad } from "../planning/use-load";
import { fetchBackupStatus } from "./api";

export function BackupStatusRow() {
  const { t } = useTranslation();
  const { data, failed } = useLoad(fetchBackupStatus, []);
  let text: string | null = null;
  if (failed) text = t("errors.network");
  else if (data) {
    if (!data.configured) text = t("settings.backup.notConfigured");
    else if (!data.lastBackupAt) text = t("settings.backup.none");
    else {
      text = t("settings.backup.last", {
        date: formatDateTime(data.lastBackupAt),
        size: data.lastBackupBytes === null ? "" : ` · ${formatBytes(data.lastBackupBytes)}`,
      });
    }
  }
  return (
    <div className="rounded-card bg-surface p-4">
      <p className="text-[0.72rem] font-semibold text-muted">{t("settings.backup.title")}</p>
      <p className="text-[0.88rem]">{text ?? t("settings.backup.loading")}</p>
    </div>
  );
}
