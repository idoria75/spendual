import type { Dashboard } from "@spendual/shared";
import { useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../../components/ui/button";
import { cn } from "../../lib/cn";
import { formatMoney, fromCents, toCents } from "../../lib/currency";
import { toneColor } from "../transactions/display";
import { useEntry } from "../transactions/entry";
import { useLookups } from "../transactions/lookups";
import { useMonth } from "../transactions/month";
import { fetchAllowances, fetchDashboard } from "./api";
import { AllowanceSheet } from "./AllowanceSheet";
import { Bar, formatRate, percentOf } from "./display";
import { useLoad } from "./use-load";

function Row({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="truncate text-[0.85rem] text-muted">{label}</dt>
      <dd className={cn("whitespace-nowrap tabular-nums", strong ? "font-bold" : "font-semibold")}>
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
        <Row strong label={t("dashboard.savings")} value={formatMoney(d.savingsBeforeGoals)} />
        <Row label={t("dashboard.unallocated")} value={formatMoney(d.unallocatedSavings)} />
        <Row label={t("dashboard.savingsRate")} value={formatRate(d.savingsRate)} />
      </dl>
    </section>
  );
}

function PlannedCard({ d }: { d: Dashboard }) {
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

function PeopleCard({
  d,
  month,
  onAllocate,
}: {
  d: Dashboard;
  month: string;
  onAllocate: (p: { id: number; name: string }) => void;
}) {
  const { t } = useTranslation();
  const { data: lookups } = useLookups();
  const { version } = useEntry();
  const allowances = useLoad(() => fetchAllowances(month), [month, version]);
  return (
    <section aria-labelledby="dash-people" className="rounded-card bg-surface p-4">
      <Eyebrow>
        <span id="dash-people">{t("dashboard.people")}</span>
      </Eyebrow>
      <ul className="mt-2 flex flex-col gap-3">
        {d.people.map((p) => {
          const u = lookups?.users.find((x) => x.id === p.userId);
          const name = u?.displayName ?? String(p.userId);
          const entry = allowances.data?.people.find((x) => x.ownerId === p.userId);
          const missing = allowances.data !== null && entry?.allocation === null;
          return (
            <li
              key={p.userId}
              style={{ borderLeftColor: toneColor(u?.tonePalette) }}
              className="flex flex-col gap-1 border-l-[3px] pl-3"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate font-semibold">{name}</span>
                <span className="whitespace-nowrap font-bold tabular-nums">
                  <span className="sr-only">{t("dashboard.balance")} </span>
                  {formatMoney(p.closingBalance)}
                </span>
              </div>
              <p className="text-[0.8rem] text-muted tabular-nums">
                {t("dashboard.allowanceLine", { amount: formatMoney(p.allowanceAllocated) })}
              </p>
              {missing ? (
                <Button
                  variant="ghost"
                  className="self-start"
                  onClick={() => onAllocate({ id: p.userId, name })}
                >
                  {t("allowance.set", { name })}
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Início: month numbers from the server (ui-guidelines §7). */
export function DashboardView() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { month } = useMonth();
  const { version } = useEntry();
  const { data, failed, reload } = useLoad(() => fetchDashboard(month), [month, version]);
  const [allocating, setAllocating] = useState<{ id: number; name: string } | null>(null);
  const [refresh, setRefresh] = useState(0);

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
        <div className="grid gap-3 md:grid-cols-2" key={refresh}>
          <ActualCard d={data} />
          <PlannedCard d={data} />
          <OverallBudget d={data} />
          <PeopleCard d={data} month={month} onAllocate={setAllocating} />
        </div>
      )}
      <AllowanceSheet
        person={allocating}
        month={month}
        onClose={() => setAllocating(null)}
        onSaved={() => {
          setAllocating(null);
          setRefresh((n) => n + 1);
          reload();
        }}
      />
    </section>
  );
}
