import type { Dashboard } from "@spendual/shared";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../../components/ui/button";
import { cn } from "../../lib/cn";
import { formatMoney, fromCents, toCents } from "../../lib/currency";
import { CategoryTile, categoryColor } from "../transactions/CategoryTile";
import { useEntry } from "../transactions/entry";
import { useLookups } from "../transactions/lookups";
import { useMonth } from "../transactions/month";
import { fetchBills, fetchDashboard } from "./api";
import { Bar, formatRate, percentOf } from "./display";
import { BillRow } from "./BillsView";
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

const LEGEND_TOP = 4;

/** One stacked bar of household spending by category, biggest first (ui-guidelines §6.5). */
function SpendingChart({ d }: { d: Dashboard }) {
  const { t } = useTranslation();
  const { data: lookups } = useLookups();
  const items = d.categorySpending
    .map((s) => ({ ...s, cents: toCents(s.amount) }))
    .filter((s) => s.cents > 0n)
    .sort((a, b) => (a.cents === b.cents ? 0 : a.cents > b.cents ? -1 : 1));
  const total = items.reduce((sum, s) => sum + s.cents, 0n);
  const nameOf = (id: number | null) =>
    id === null
      ? t("list.noCategory")
      : (lookups?.categories.find((c) => c.id === id)?.name ?? t("list.noCategory"));
  const top = items.slice(0, LEGEND_TOP);
  const rest = items.slice(LEGEND_TOP);
  const restCents = rest.reduce((sum, s) => sum + s.cents, 0n);
  const pct = (cents: bigint) => `${Math.round(percentOf(cents, total))}%`;

  return (
    <section aria-labelledby="dash-spending" className="rounded-card bg-surface p-4">
      <Eyebrow>
        <span id="dash-spending">{t("dashboard.spending")}</span>
      </Eyebrow>
      {items.length === 0 ? (
        <p className="mt-2 text-[0.85rem] text-muted">{t("dashboard.spendingEmpty")}</p>
      ) : (
        <>
          <div aria-hidden className="mt-3 flex h-[10px] gap-[2px] overflow-hidden rounded-chip">
            {items.map((s) => (
              <span
                key={s.categoryId ?? "none"}
                data-testid="spending-segment"
                className="h-full min-w-[2px]"
                style={{
                  flex: `${percentOf(s.cents, total)} 1 0%`,
                  background: categoryColor(s.categoryId),
                }}
              />
            ))}
          </div>
          <ul className="mt-3 flex flex-col gap-2">
            {top.map((s) => (
              <li
                key={s.categoryId ?? "none"}
                className="grid grid-cols-[28px_1fr_auto_auto] items-center gap-3"
              >
                <CategoryTile id={s.categoryId} />
                <span className="text-[0.88rem] leading-tight [overflow-wrap:anywhere]">
                  {nameOf(s.categoryId)}
                </span>
                <span className="whitespace-nowrap text-[0.88rem] font-semibold tabular-nums">
                  {formatMoney(s.amount)}
                </span>
                <span className="w-10 whitespace-nowrap text-right text-[0.78rem] tabular-nums text-muted">
                  {pct(s.cents)}
                </span>
              </li>
            ))}
            {rest.length > 0 ? (
              <li className="grid grid-cols-[28px_1fr_auto_auto] items-center gap-3">
                <span aria-hidden className="mx-auto h-3 w-3 rounded-tile bg-muted" />
                <span className="text-[0.88rem] leading-tight">
                  {t("dashboard.others", { count: rest.length })}
                </span>
                <span className="whitespace-nowrap text-[0.88rem] font-semibold tabular-nums">
                  {formatMoney(fromCents(restCents))}
                </span>
                <span className="w-10 whitespace-nowrap text-right text-[0.78rem] tabular-nums text-muted">
                  {pct(restCents)}
                </span>
              </li>
            ) : null}
          </ul>
        </>
      )}
    </section>
  );
}

/** The next planned bills. Tap opens the "Confirmar pagamento" sheet. */
function UpcomingBills({ d }: { d: Dashboard }) {
  const { t } = useTranslation();
  const { openConfirm } = useEntry();
  return (
    <section aria-labelledby="dash-upcoming" className="rounded-card bg-surface p-4">
      <Eyebrow>
        <span id="dash-upcoming">{t("dashboard.upcoming")}</span>
      </Eyebrow>
      {d.upcoming.length === 0 ? (
        <p className="mt-2 text-[0.85rem] text-muted">{t("dashboard.upcomingEmpty")}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {d.upcoming.map((b) => (
            <BillRow
              key={`${b.kind}-${b.id}`}
              bill={b}
              late={false}
              onOpen={() => openConfirm(b)}
            />
          ))}
        </ul>
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
          <SpendingChart d={data} />
          <UpcomingBills d={data} />
          <OverallBudget d={data} />
        </div>
      )}
    </section>
  );
}
