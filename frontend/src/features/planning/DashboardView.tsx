import type { Dashboard } from "@spendual/shared";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../../components/ui/button";
import { cn } from "../../lib/cn";
import { formatMoney, fromCents, toCents } from "../../lib/currency";
import { useEntry } from "../transactions/entry";
import { useMonth } from "../transactions/month";
import { fetchBills, fetchDashboard } from "./api";
import { Bar, formatRate, percentOf } from "./display";
import { useLoad } from "./use-load";

function Row({
  label,
  value,
  strong,
  warn,
}: {
  label: string;
  value: ReactNode;
  strong?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="truncate text-[0.85rem] text-muted">{label}</dt>
      <dd
        className={cn(
          "whitespace-nowrap tabular-nums",
          strong ? "font-bold" : "font-semibold",
          warn && "text-warn",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted">{children}</p>
  );
}

const isNegative = (amount: string) => toCents(amount) < 0;

function ActualCard({ d }: { d: Dashboard }) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="dash-actual" className="rounded-card bg-surface p-4">
      <Eyebrow>
        <span id="dash-actual">{t("dashboard.actual")}</span>
      </Eyebrow>
      <dl className="mt-2 flex flex-col gap-2">
        <Row label={t("dashboard.income")} value={formatMoney(d.householdIncome)} />
        <Row label={t("dashboard.sharedExpenses")} value={formatMoney(d.sharedExpensesNet)} />
        <Row label={t("dashboard.allowances")} value={formatMoney(d.allowanceAllocations)} />
        <Row
          strong
          warn={isNegative(d.savingsBeforeGoals)}
          label={t("dashboard.savings")}
          value={formatMoney(d.savingsBeforeGoals)}
        />
        <Row
          warn={isNegative(d.unallocatedSavings)}
          label={t("dashboard.unallocated")}
          value={formatMoney(d.unallocatedSavings)}
        />
        <Row label={t("dashboard.savingsRate")} value={formatRate(d.savingsRate)} />
      </dl>
    </section>
  );
}

function PlannedCard({ d, overdueCount }: { d: Dashboard; overdueCount: number }) {
  const { t } = useTranslation();
  return (
    <section
      aria-labelledby="dash-planned"
      className="rounded-card border-[1.5px] border-dashed border-line p-4"
    >
      <Eyebrow>
        <span id="dash-planned">{t("dashboard.planned")}</span>
      </Eyebrow>
      <p className="mt-2 text-[1.3rem] font-bold tabular-nums">
        {formatMoney(d.plannedBillsTotal)}
      </p>
      {d.plannedBillsUnknownCount > 0 ? (
        <p className="text-[0.82rem] text-muted">
          {t("dashboard.unknownCount", { count: d.plannedBillsUnknownCount })}
        </p>
      ) : null}
      {overdueCount > 0 ? (
        <p className="text-[0.82rem] font-semibold text-warn">
          {t("dashboard.overdue", { count: overdueCount })}
        </p>
      ) : null}
      <Link
        to="/a-pagar"
        className="mt-1 inline-flex min-h-[44px] items-center text-[0.85rem] font-semibold text-accent"
      >
        {t("dashboard.seeBills")}
      </Link>
    </section>
  );
}

function OverallBudget({ d }: { d: Dashboard }) {
  const { t } = useTranslation();
  const { budget, spent } = d.overallBudget;
  const spentCents = toCents(spent);
  const budgetCents = budget === null ? 0n : toCents(budget);
  const over = budget !== null && spentCents > budgetCents;
  return (
    <section aria-labelledby="dash-budget" className="rounded-card bg-surface p-4">
      <Eyebrow>
        <span id="dash-budget">{t("dashboard.overallBudget")}</span>
      </Eyebrow>
      {budget === null ? (
        <p className="mt-2 text-muted">{t("budgets.none")}</p>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          <p className="tabular-nums">
            <span className="font-bold">{formatMoney(spent)}</span>{" "}
            <span className="text-muted">{t("budgets.of", { amount: formatMoney(budget) })}</span>
          </p>
          <Bar
            label={t("dashboard.overallBudget")}
            percent={percentOf(spentCents, budgetCents)}
            over={over}
          />
          {over ? (
            <p className="text-[0.82rem] text-warn">
              {t("budgets.over", { amount: formatMoney(fromCents(spentCents - budgetCents)) })}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}

/** Início: month numbers from the server (ui-guidelines §7). */
export function DashboardView() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { month } = useMonth();
  const { version } = useEntry();
  const bills = useLoad(() => fetchBills(month), [month, version]);
  const { data, failed, reload } = useLoad(() => fetchDashboard(month), [month, version]);

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h1 className="text-[17px] font-bold">{t("home.title")}</h1>
        <p className="text-[0.85rem] text-muted">
          {t("home.welcome", { name: user?.displayName ?? "" })}
        </p>
      </div>
      {failed ? (
        <div role="alert" className="flex flex-col items-start gap-2 text-err">
          <p>{t("dashboard.failed")}</p>
          <Button variant="ghost" onClick={reload}>
            {t("common.retry")}
          </Button>
        </div>
      ) : data === null ? (
        <p role="status" className="py-6 text-muted">
          {t("common.loading")}
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <ActualCard d={data} />
          <PlannedCard d={data} overdueCount={bills.data?.overdue.length ?? 0} />
          <OverallBudget d={data} />
        </div>
      )}
    </section>
  );
}
