import type { PersonSummary } from "@spendual/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../../components/ui/button";
import { Segmented } from "../../components/ui/segmented";
import { formatMoney, fromCents, toCents } from "../../lib/currency";
import { currentMonth, formatMonth } from "../../lib/date";
import { RANGES, formatRange, trendWindow, type RangeMonths } from "../analytics/trend";
import { GoalsPanel } from "../goals/GoalsView";
import { listTransactions } from "../transactions/api";
import { toneColor } from "../transactions/display";
import { useEntry } from "../transactions/entry";
import { useLookups, useSingleUser } from "../transactions/lookups";
import { useMonth } from "../transactions/month";
import { TransactionList } from "../transactions/TransactionList";
import { UserPicker } from "../transactions/UserPicker";
import { fetchAllowances, fetchDashboard, fetchPersonalHistory } from "./api";
import { AllowanceSheet } from "./AllowanceSheet";
import { BalanceChart } from "./BalanceChart";
import { useLoad } from "./use-load";

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[0.85rem] text-muted">{label}</dt>
      <dd className={strong ? "font-bold tabular-nums" : "tabular-nums"}>{value}</dd>
    </div>
  );
}

/** The month of one person: balance, what it started from and what moved it. */
function MonthCard({
  p,
  name,
  color,
  month,
  missingAllowance,
  onAllocate,
  onAddBalance,
}: {
  p: PersonSummary;
  name: string;
  color: string;
  month: string;
  missingAllowance: boolean;
  onAllocate: () => void;
  onAddBalance: () => void;
}) {
  const { t } = useTranslation();
  const heading = [name, formatMonth(month)].join(" · ");
  const opening = fromCents(
    toCents(p.closingBalance) -
      toCents(p.allowanceAllocated) -
      toCents(p.personalCredits) +
      toCents(p.personalSpent) +
      toCents(p.goalNet),
  );
  return (
    <section
      aria-label={t("pessoal.month", { month: formatMonth(month) })}
      style={{ borderLeftColor: color }}
      className="flex flex-col gap-2 rounded-card border-l-[3px] bg-surface p-4"
    >
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted">
        {heading}
      </h2>
      <dl className="flex flex-col gap-1">
        <Row label={t("pessoal.closing")} value={formatMoney(p.closingBalance)} strong />
        <Row label={t("pessoal.opening")} value={formatMoney(opening)} />
        <Row label={t("pessoal.allowance")} value={formatMoney(p.allowanceAllocated)} />
        <Row label={t("pessoal.credits")} value={formatMoney(p.personalCredits)} />
        <Row label={t("pessoal.spent")} value={formatMoney(p.personalSpent)} />
        {toCents(p.goalNet) !== 0n ? (
          <Row label={t("pessoal.inGoals")} value={formatMoney(p.goalNet)} />
        ) : null}
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" onClick={onAddBalance}>
          {t("pessoal.addBalance")}
        </Button>
        {missingAllowance ? (
          <Button variant="ghost" onClick={onAllocate}>
            {t("allowance.set", { name })}
          </Button>
        ) : null}
      </div>
    </section>
  );
}

/**
 * Pessoal: one person at a time (picker like Lançamentos). The month card, a chart of the
 * balance at the end of each month, then the person's personal records of the month.
 * Reached through Mais (ui-guidelines §2).
 */
export function PessoalView() {
  const { t } = useTranslation();
  const { month } = useMonth();
  const entry = useEntry();
  const { version } = entry;
  const { user } = useAuth();
  const { data: lookups } = useLookups();
  const singleUser = useSingleUser();
  const [picked, setPicked] = useState<number | null>(null);
  const [range, setRange] = useState<RangeMonths>(6);
  const [allocating, setAllocating] = useState<{ id: number; name: string } | null>(null);

  const users = lookups?.users ?? [];
  const personId = picked ?? user?.id ?? users[0]?.id ?? null;
  const person = users.find((u) => u.id === personId);
  const name = person?.displayName ?? "";
  const color = toneColor(person?.tonePalette);
  const { from, to } = trendWindow(month, currentMonth(), range);

  const dashboard = useLoad(() => fetchDashboard(month), [month, version]);
  const allowances = useLoad(() => fetchAllowances(month), [month, version]);
  const history = useLoad(
    () => (personId === null ? Promise.resolve(null) : fetchPersonalHistory(personId, from, to)),
    [personId, from, to, version],
  );
  const records = useLoad(
    () =>
      personId === null
        ? Promise.resolve(null)
        : listTransactions({ month, scope: "personal", personId }),
    [personId, month, version],
  );

  const recordsTitle = [t("pessoal.records"), formatMonth(month)].join(" · ");
  // Deposits are dated today, so what a deposit can use is the balance of the current month.
  const nowDashboard = useLoad(() => fetchDashboard(currentMonth()), [version]);
  const free = nowDashboard.data?.people.find((x) => x.userId === personId)?.closingBalance ?? null;
  const summary = dashboard.data?.people.find((x) => x.userId === personId);
  const allowance = allowances.data?.people.find((x) => x.ownerId === personId);
  const failed = dashboard.failed || history.failed || records.failed;

  return (
    <section className="flex flex-col gap-3">
      <h1 className="text-[17px] font-bold">{t("nav.pessoal")}</h1>
      {singleUser || personId === null ? null : (
        <UserPicker
          users={users}
          selected={personId}
          onSelect={setPicked}
          legend={t("pessoal.person")}
        />
      )}
      {failed ? (
        <div role="alert" className="flex flex-col items-start gap-2 text-err">
          <p>{t("pessoal.failed")}</p>
          <Button
            variant="ghost"
            onClick={() => {
              dashboard.reload();
              history.reload();
              records.reload();
            }}
          >
            {t("common.retry")}
          </Button>
        </div>
      ) : null}
      {summary ? (
        <MonthCard
          p={summary}
          name={name}
          color={color}
          month={month}
          missingAllowance={allowances.data !== null && allowance?.allocation === null}
          onAllocate={() => personId !== null && setAllocating({ id: personId, name })}
          onAddBalance={() =>
            personId !== null &&
            entry.openPreset({ type: "income", scope: "personal", ownerId: personId })
          }
        />
      ) : failed ? null : (
        <p role="status" className="py-6 text-muted">
          {t("common.loading")}
        </p>
      )}

      {personId === null ? null : (
        <GoalsPanel
          key={personId}
          ownerId={personId}
          free={free}
          canAct={personId === user?.id}
          heading={<h2 className="text-[17px] font-bold">{t("pessoal.goals")}</h2>}
          onChanged={() => {
            dashboard.reload();
            nowDashboard.reload();
            history.reload();
          }}
        />
      )}

      <section aria-label={t("pessoal.chartTitle")} className="flex flex-col gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted">
          {t("pessoal.chartTitle")}
        </h2>
        <Segmented
          label={t("pessoal.range")}
          value={String(range)}
          options={RANGES.map((n) => ({
            value: String(n),
            label: t("analytics.months", { count: n }),
          }))}
          onChange={(v) => setRange(Number(v) as RangeMonths)}
        />
        {history.data === null ? null : history.data.points.length === 0 ? (
          <p className="text-muted">{t("pessoal.chartEmpty")}</p>
        ) : (
          <BalanceChart
            points={history.data.points}
            color={color}
            label={t("pessoal.chartLabel", { name, range: formatRange(from, to) })}
          />
        )}
      </section>

      <section aria-label={t("pessoal.records")} className="flex flex-col gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted">
          {recordsTitle}
        </h2>
        {records.data === null ? null : records.data.length === 0 ? (
          <p className="text-muted">{t("pessoal.empty")}</p>
        ) : (
          <TransactionList items={records.data} />
        )}
      </section>

      <AllowanceSheet
        person={allocating}
        month={month}
        onClose={() => setAllocating(null)}
        onSaved={() => {
          setAllocating(null);
          allowances.reload();
          dashboard.reload();
          history.reload();
        }}
      />
    </section>
  );
}
