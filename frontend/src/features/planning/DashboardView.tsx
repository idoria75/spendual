import type { Dashboard } from "@spendual/shared";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { cn } from "../../lib/cn";
import { formatMoney, fromCents, toCents } from "../../lib/currency";
import { CategoryTile, categoryColor } from "../transactions/CategoryTile";
import { spendingLink } from "../transactions/drilldown";
import { useEntry } from "../transactions/entry";
import { useLookups } from "../transactions/lookups";
import { useMonth } from "../transactions/month";
import { fetchBills, fetchDashboard } from "./api";
import { Bar, percentOf } from "./display";
import { BillRow } from "./BillsView";
import { useLoad } from "./use-load";

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted">{children}</p>
  );
}

const LEGEND_TOP = 4;
const SEPARATOR = " / ";
const LEGEND_ROW =
  "grid min-h-[44px] grid-cols-[28px_1fr_auto_auto_16px] items-center gap-3 rounded-input";

/**
 * Top block of Início, like a bank app: what is left of the month's budget, what was spent of
 * the total, and one stacked bar of spending by category in proportion to that budget.
 * Two categories that are 25 % of the budget each take a quarter of the bar each; the empty rest
 * is the balance. Over budget, the bar scales to the spending. Without a budget, to the spending.
 */
function BalanceCard({ d }: { d: Dashboard }) {
  const { t } = useTranslation();
  const { data: lookups } = useLookups();
  const { budget, spent } = d.overallBudget;
  const spentCents = toCents(spent);
  const budgetCents = budget === null ? null : toCents(budget);
  const balance = budgetCents === null ? null : budgetCents - spentCents;
  const over = balance !== null && balance < 0n;
  const items = d.categorySpending
    .map((s) => ({ ...s, cents: toCents(s.amount) }))
    .filter((s) => s.cents > 0n)
    .sort((a, b) => (a.cents === b.cents ? 0 : a.cents > b.cents ? -1 : 1));
  const itemsTotal = items.reduce((sum, s) => sum + s.cents, 0n);
  // The bar is 100 % of the budget, or of the spending when that is bigger or there is no budget.
  const whole = budgetCents !== null && budgetCents > itemsTotal ? budgetCents : itemsTotal;
  const base = budgetCents !== null && budgetCents > 0n ? budgetCents : itemsTotal;
  const nameOf = (id: number | null) =>
    id === null
      ? t("list.noCategory")
      : (lookups?.categories.find((c) => c.id === id)?.name ?? t("list.noCategory"));
  const top = items.slice(0, LEGEND_TOP);
  const rest = items.slice(LEGEND_TOP);
  const restCents = rest.reduce((sum, s) => sum + s.cents, 0n);
  const pct = (cents: bigint) => `${Math.round(percentOf(cents, base))}%`;

  return (
    <section
      aria-labelledby="dash-balance"
      className="flex flex-col gap-3 rounded-card bg-surface p-4 md:col-span-2"
    >
      <div>
        <Eyebrow>
          <span id="dash-balance">{t("dashboard.balanceNow")}</span>
        </Eyebrow>
        {balance === null ? (
          <p className="mt-1 text-[0.9rem] text-muted">{t("budgets.none")}</p>
        ) : (
          <p
            className={cn(
              "mt-1 text-[2rem] font-bold leading-none tabular-nums",
              over && "text-warn",
              balance > 0n && "text-pos",
            )}
          >
            {formatMoney(fromCents(balance))}
          </p>
        )}
      </div>

      <div>
        <Eyebrow>{t("dashboard.spentOfTotal")}</Eyebrow>
        <p className="mt-1 tabular-nums">
          <span className="text-[1.1rem] font-bold">{formatMoney(spent)}</span>
          <span className="text-muted">
            {SEPARATOR}
            {budget === null ? t("budgets.none") : formatMoney(budget)}
          </span>
        </p>
        {over && budgetCents !== null ? (
          <p className="text-[0.82rem] text-warn">
            {t("budgets.over", { amount: formatMoney(fromCents(spentCents - budgetCents)) })}
          </p>
        ) : null}
        {budget === null ? (
          <Link
            to="/orcamentos"
            className="inline-flex min-h-[44px] items-center text-[0.85rem] font-semibold text-accent"
          >
            {t("dashboard.setBudget")}
          </Link>
        ) : null}
      </div>

      <section aria-label={t("dashboard.spending")}>
        <div
          aria-hidden
          data-testid="spending-track"
          className="flex h-[10px] gap-[2px] overflow-hidden rounded-chip bg-surface-2"
        >
          {items.map((s) => (
            <span
              key={s.categoryId ?? "none"}
              data-testid="spending-segment"
              data-percent={percentOf(s.cents, whole).toFixed(2)}
              className="h-full min-w-[2px] shrink"
              style={{
                width: `${percentOf(s.cents, whole)}%`,
                background: categoryColor(s.categoryId),
              }}
            />
          ))}
        </div>
        {items.length === 0 ? (
          <p className="mt-2 text-[0.85rem] text-muted">{t("dashboard.spendingEmpty")}</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {top.map((s) => (
              <li key={s.categoryId ?? "none"}>
                <Link
                  to={spendingLink([s.categoryId])}
                  aria-label={t("dashboard.seeCategory", { name: nameOf(s.categoryId) })}
                  className={LEGEND_ROW}
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
                  <ChevronRight size={16} aria-hidden className="text-muted" />
                </Link>
              </li>
            ))}
            {rest.length > 0 ? (
              <li>
                <Link
                  to={spendingLink(rest.map((s) => s.categoryId))}
                  aria-label={t("dashboard.seeOthers")}
                  className={LEGEND_ROW}
                >
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
                  <ChevronRight size={16} aria-hidden className="text-muted" />
                </Link>
              </li>
            ) : null}
          </ul>
        )}
      </section>

      <Pace d={d} />
      <MonthResult d={d} />
    </section>
  );
}

/**
 * Spending so far against the same days of last month. Only for the current month, and only when
 * last month had spending by that day. A comparison, not a forecast (guide section 9).
 */
function Pace({ d }: { d: Dashboard }) {
  const { t } = useTranslation();
  const pace = d.pace;
  const last = pace ? toCents(pace.lastMonthSameDays) : 0n;
  if (!pace || last <= 0n) return null;
  const diff = toCents(pace.spent) - last;
  const percent = Math.round(Math.abs(percentOf(diff, last)));
  const verdict =
    diff === 0n
      ? t("dashboard.paceSame")
      : t(diff > 0n ? "dashboard.paceMore" : "dashboard.paceLess", { percent });
  return (
    <div className="flex flex-col gap-1 border-t border-line pt-2 text-[0.85rem]">
      <p className="text-muted">
        {t("dashboard.paceLine", {
          day: pace.day,
          spent: formatMoney(pace.spent),
          last: formatMoney(pace.lastMonthSameDays),
        })}
      </p>
      <p className={cn("font-semibold", diff > 0n ? "text-warn" : "text-pos")}>{verdict}</p>
      <p className="text-[0.78rem] text-muted">
        {t("dashboard.paceHint", { total: formatMoney(pace.lastMonthTotal) })}
      </p>
    </div>
  );
}

/** Savings of the month with the sum behind it, folded away until asked for (ui-guidelines §7). */
function MonthResult({ d }: { d: Dashboard }) {
  const { t } = useTranslation();
  const savings = toCents(d.savingsBeforeGoals);
  // With no goal money in the month the two savings numbers match; show the split only then.
  const goalNet = toCents(d.goalAllocationsNet);
  const showUnallocated = goalNet !== 0n;
  const target = d.savingsTarget === null ? null : toCents(d.savingsTarget);
  return (
    <>
      {target !== null && target > 0n ? (
        <div className="flex flex-col gap-1 border-t border-line pt-2">
          <div className="flex items-baseline justify-between gap-3 text-[0.85rem]">
            <span className="text-muted">{t("dashboard.target")}</span>
            <span className="tabular-nums">{formatMoney(d.savingsTarget ?? "0.00")}</span>
          </div>
          <Bar
            label={t("dashboard.target")}
            percent={percentOf(savings, target)}
            over={false}
            color="var(--pos)"
          />
          <p
            className={cn(
              "text-[0.8rem]",
              savings >= target ? "font-semibold text-pos" : "text-muted",
            )}
          >
            {savings >= target
              ? t("dashboard.targetMet")
              : t("dashboard.targetLeft", { amount: formatMoney(fromCents(target - savings)) })}
          </p>
        </div>
      ) : null}
      <details className="group border-t border-line pt-1">
        <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
          <span className="flex items-baseline gap-2">
            <span className="text-[0.85rem] text-muted">{t("dashboard.savings")}</span>
            <span
              className={cn(
                "font-bold tabular-nums",
                savings > 0n && "text-pos",
                savings < 0n && "text-warn",
              )}
            >
              {formatMoney(d.savingsBeforeGoals)}
            </span>
          </span>
          <span className="flex items-center gap-1 text-[0.85rem] font-semibold text-accent">
            {t("dashboard.details")}
            <ChevronDown size={16} aria-hidden className="transition-none group-open:rotate-180" />
          </span>
        </summary>
        <dl className="flex flex-col gap-2 pb-1 pt-1">
          <ResultRow label={t("dashboard.income")} value={formatMoney(d.householdIncome)} />
          <ResultRow
            label={t("dashboard.sharedExpenses")}
            value={formatMoney(d.sharedExpensesNet)}
          />
          <ResultRow
            label={t("dashboard.allowances")}
            value={formatMoney(d.allowanceAllocations)}
          />
          {showUnallocated ? (
            <>
              <ResultRow label={t("dashboard.inGoals")} value={formatMoney(d.goalAllocationsNet)} />
              <ResultRow
                label={t("dashboard.unallocated")}
                value={formatMoney(d.unallocatedSavings)}
              />
            </>
          ) : null}
        </dl>
        <p className="pb-1 text-[0.78rem] text-muted">{t("dashboard.savingsHint")}</p>
      </details>
    </>
  );
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="truncate text-[0.85rem] text-muted">{label}</dt>
      <dd className="whitespace-nowrap font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

/**
 * Forecast and the next bills in one dashed card. A bill that repeats (rule or plan) shows once,
 * with its next due date. Tap opens the "Confirmar pagamento" sheet.
 */
function NextBillsCard({ d, overdueCount }: { d: Dashboard; overdueCount: number }) {
  const { t } = useTranslation();
  const { openConfirm } = useEntry();
  const seen = new Set<string>();
  const next = d.upcoming.filter((b) => {
    const key = `${b.kind}-${b.parentId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return (
    <section
      aria-labelledby="dash-upcoming"
      className="flex flex-col gap-2 rounded-card border-[1.5px] border-dashed border-line p-4 md:col-span-2"
    >
      <Eyebrow>
        <span id="dash-upcoming">{t("dashboard.upcoming")}</span>
      </Eyebrow>
      <div>
        <p className="text-[0.82rem] text-muted">{t("dashboard.planned")}</p>
        <p className="text-[1.3rem] font-bold tabular-nums">{formatMoney(d.plannedBillsTotal)}</p>
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
      </div>
      {next.length === 0 ? (
        <p className="text-[0.85rem] text-muted">{t("dashboard.upcomingEmpty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {next.map((b) => (
            <BillRow
              key={`${b.kind}-${b.id}`}
              bill={b}
              late={false}
              onOpen={() => openConfirm(b)}
            />
          ))}
        </ul>
      )}
      <Link
        to="/a-pagar"
        className="inline-flex min-h-[44px] items-center self-start text-[0.85rem] font-semibold text-accent"
      >
        {t("dashboard.seeBills")}
      </Link>
    </section>
  );
}

/** Início: month numbers from the server (ui-guidelines §7). */
export function DashboardView() {
  const { t } = useTranslation();
  const { month } = useMonth();
  const { version } = useEntry();
  const bills = useLoad(() => fetchBills(month), [month, version]);
  const { data, failed, reload } = useLoad(() => fetchDashboard(month), [month, version]);

  return (
    <section className="flex flex-col gap-3">
      <h1 className="text-[17px] font-bold">{t("home.title")}</h1>
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
          <BalanceCard d={data} />
          <NextBillsCard d={data} overdueCount={bills.data?.overdue.length ?? 0} />
        </div>
      )}
    </section>
  );
}
