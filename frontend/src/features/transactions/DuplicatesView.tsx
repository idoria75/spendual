import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/button";
import { formatMonth } from "../../lib/date";
import { useLoad } from "../planning/use-load";
import { fetchDuplicates } from "./api";
import { useEntry } from "./entry";
import { useMonth } from "./month";
import { TransactionList } from "./TransactionList";

/**
 * Possible duplicates of the month: records with the same type, amount, scope and description,
 * a few days apart. Open one to void it, correct it or leave it (they may be real).
 */
export function DuplicatesView() {
  const { t } = useTranslation();
  const { month } = useMonth();
  const { version } = useEntry();
  const { data, failed, reload } = useLoad(() => fetchDuplicates(month), [month, version]);

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h1 className="text-[17px] font-bold">{t("duplicates.title")}</h1>
        <p className="text-[0.85rem] text-muted">
          {t("duplicates.hint", { month: formatMonth(month) })}
        </p>
      </div>
      {failed ? (
        <div role="alert" className="flex flex-col items-start gap-2 text-err">
          <p>{t("duplicates.failed")}</p>
          <Button variant="ghost" onClick={reload}>
            {t("common.retry")}
          </Button>
        </div>
      ) : data === null ? (
        <p role="status" className="py-6 text-muted">
          {t("common.loading")}
        </p>
      ) : data.groups.length === 0 ? (
        <p className="text-muted">{t("duplicates.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.groups.map((g) => (
            <li
              key={g.items.map((x) => x.id).join("-")}
              aria-label={t("duplicates.group", { count: g.items.length })}
              className="flex flex-col gap-2 rounded-card bg-surface p-3"
            >
              <p className="text-[0.8rem] font-semibold text-muted">
                {t("duplicates.group", { count: g.items.length })}
              </p>
              <TransactionList items={g.items} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
