import type { BackupStatus } from "@spendual/shared";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatBytes } from "../../lib/bytes";
import { formatDateTime } from "../../lib/date";
import { fetchBackupStatus } from "./api";

export function BackupStatusRow() {
  const { t } = useTranslation();
  const [data, setData] = useState<BackupStatus | null>(null);
  const [failed, setFailed] = useState(false);

  // Handled here: a failed read is a message on the row, not a logged bug.
  useEffect(() => {
    let active = true;
    fetchBackupStatus().then(
      (status) => {
        if (active) setData(status);
      },
      () => {
        if (active) setFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  let text: string | null = null;
  if (failed) text = t("settings.backup.failed");
  else if (data) {
    if (!data.configured) text = t("settings.backup.notConfigured");
    else if (!data.lastBackupAt) text = t("settings.backup.none");
    else {
      const date = formatDateTime(data.lastBackupAt);
      text =
        data.lastBackupBytes === null
          ? t("settings.backup.lastNoSize", { date })
          : t("settings.backup.last", { date, size: formatBytes(data.lastBackupBytes) });
    }
  }
  return (
    <div className="rounded-card bg-surface p-4">
      <p className="text-[0.72rem] font-semibold text-muted">{t("settings.backup.title")}</p>
      <p className="text-[0.88rem]">{text ?? t("settings.backup.loading")}</p>
    </div>
  );
}
