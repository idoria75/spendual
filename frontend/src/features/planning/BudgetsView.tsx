import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { BudgetLine } from "@spendual/shared";
import { Button } from "../../components/ui/button";
import { formatMoney, fromCents, toCents } from "../../lib/currency";
import { CategoryTile } from "../transactions/CategoryTile";
import { useEntry } from "../transactions/entry";
import { useLookups } from "../transactions/lookups";
import { useMonth } from "../transactions/month";
import { fetchBudgets } from "./api";
import { BudgetSheet, type BudgetTarget } from "./BudgetSheet";
import { Bar, percentOf } from "./display";
import { useLoad } from "./use-load";

function BudgetRow({
  line,
  name,
  categoryId,
  onEdit,
}: {
  line: BudgetLine;
  name: string;
  categoryId: number | null;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  const spent = toCents(line.spent);
  const budget = line.amount === null ? null : toCents(line.amount);
  const over = budget !== null && spent > budget;
  const budgetText = line.amount === null ? "" : ` / ${formatMoney(line.amount)}`;
  return (
    <li>
      <button
        type="button"
        onClick={onEdit}
        aria-label={t("budgets.edit", { name })}
        className="flex min-h-[56px] w-full flex-col gap-2 rounded-input bg-surface px-3 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <span className="grid grid-cols-[28px_1fr_auto] items-center gap-3">
          <CategoryTile id={categoryId} />
          <span className="truncate font-semibold">{name}</span>
          <span className="whitespace-nowrap text-[0.88rem] tabular-nums">
            {formatMoney(line.spent)}
            {line.amount !== null ? <span className="text-muted">{budgetText}</span> : null}
          </span>
        </span>
        {line.amount === null ? (
          <span className="text-[0.8rem] text-muted">{t("budgets.none")}</span>
        ) : (
          <>
            <Bar label={name} percent={percentOf(spent, budget ?? 0n)} over={over} />
            {over ? (
              <span className="text-[0.8rem] text-warn">
                {t("budgets.over", { amount: formatMoney(fromCents(spent - (budget ?? 0n))) })}
              </span>
            ) : null}
          </>
        )}
      </button>
    </li>
  );
}

/** Orçamentos: overall household budget, then one row per category. */
export function BudgetsView() {
  const { t } = useTranslation();
  const { month } = useMonth();
  const { version } = useEntry();
  const { data: lookups } = useLookups();
  const { data, failed, reload } = useLoad(() => fetchBudgets(month), [month, version]);
  const [target, setTarget] = useState<BudgetTarget | null>(null);

  const nameOf = (id: number | null) =>
    id === null
      ? t("budgets.overall")
      : (lookups?.categories.find((c) => c.id === id)?.name ?? t("list.noCategory"));

  return (
    <section className="flex flex-col gap-3">
      <h1 className="text-[17px] font-bold">{t("nav.orcamentos")}</h1>
      {failed ? (
        <div role="alert" className="flex flex-col items-start gap-2 text-err">
          <p>{t("budgets.failed")}</p>
          <Button variant="ghost" onClick={reload}>
            {t("common.retry")}
          </Button>
        </div>
      ) : data === null ? (
        <p role="status" className="py-6 text-muted">
          {t("common.loading")}
        </p>
      ) : (
        <>
          <ul>
            <BudgetRow
              line={data.overall}
              name={nameOf(null)}
              categoryId={null}
              onEdit={() => setTarget({ line: data.overall, name: nameOf(null) })}
            />
          </ul>
          {data.categories.length === 0 ? (
            <p className="text-muted">{t("budgets.empty")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.categories.map((line) => (
                <BudgetRow
                  key={line.categoryId}
                  line={line}
                  name={nameOf(line.categoryId)}
                  categoryId={line.categoryId}
                  onEdit={() => setTarget({ line, name: nameOf(line.categoryId) })}
                />
              ))}
            </ul>
          )}
        </>
      )}
      <BudgetSheet
        target={target}
        month={month}
        onClose={() => setTarget(null)}
        onSaved={() => {
          setTarget(null);
          reload();
        }}
      />
    </section>
  );
}
