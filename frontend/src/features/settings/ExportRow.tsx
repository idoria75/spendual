import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/button";
import { Field } from "../../components/ui/field";

/** Builds the download address. Empty dates are left out; both empty = everything. */
export function exportHref(from: string, to: string): string {
  const q = new URLSearchParams();
  if (from) q.set("from", from);
  if (to) q.set("to", to);
  const query = q.toString();
  return `/api/export/transactions.csv${query ? `?${query}` : ""}`;
}

/** Download of all transactions as CSV, optionally between two dates. */
export function ExportRow() {
  const { t } = useTranslation();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const invalid = from !== "" && to !== "" && from > to;
  return (
    <div className="flex flex-col gap-3 rounded-card bg-surface p-4">
      <p className="text-[0.72rem] font-semibold text-muted">{t("settings.export.title")}</p>
      <p className="text-[0.88rem]">{t("settings.export.hint")}</p>
      <div className="grid grid-cols-2 gap-3">
        <Field
          label={t("settings.export.from")}
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <Field
          label={t("settings.export.to")}
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          error={invalid ? t("settings.export.range") : undefined}
        />
      </div>
      {invalid ? (
        <Button disabled className="self-start">
          {t("settings.export.button")}
        </Button>
      ) : (
        <Button asChild className="self-start">
          <a href={exportHref(from, to)} download>
            {t("settings.export.button")}
          </a>
        </Button>
      )}
    </div>
  );
}
