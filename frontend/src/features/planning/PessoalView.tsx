import type { AllowanceOverview, Dashboard } from "@spendual/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/button";
import { formatMoney } from "../../lib/currency";
import { toneColor } from "../transactions/display";
import { useEntry } from "../transactions/entry";
import { useLookups } from "../transactions/lookups";
import { useMonth } from "../transactions/month";
import { fetchAllowances, fetchDashboard } from "./api";
import { AllowanceSheet } from "./AllowanceSheet";
import { useLoad } from "./use-load";

function PeopleCard({
  d,
  allowances,
  onAllocate,
}: {
  d: Dashboard;
  allowances: AllowanceOverview | null;
  onAllocate: (p: { id: number; name: string }) => void;
}) {
  const { t } = useTranslation();
  const { data: lookups } = useLookups();
  return (
    <section aria-labelledby="dash-people" className="rounded-card bg-surface p-4">
      <h2
        id="dash-people"
        className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted"
      >
        {t("dashboard.people")}
      </h2>
      <ul className="mt-2 flex flex-col gap-3">
        {d.people.map((p) => {
          const u = lookups?.users.find((x) => x.id === p.userId);
          const name = u?.displayName ?? String(p.userId);
          const entry = allowances?.people.find((x) => x.ownerId === p.userId);
          const missing = allowances !== null && entry?.allocation === null;
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

/** Pessoal: balance and allowance of each person. Reached through Mais (ui-guidelines §2). */
export function PessoalView() {
  const { t } = useTranslation();
  const { month } = useMonth();
  const { version } = useEntry();
  const dashboard = useLoad(() => fetchDashboard(month), [month, version]);
  const allowances = useLoad(() => fetchAllowances(month), [month, version]);
  const [allocating, setAllocating] = useState<{ id: number; name: string } | null>(null);

  return (
    <section className="flex flex-col gap-3">
      <h1 className="text-[17px] font-bold">{t("nav.pessoal")}</h1>
      {dashboard.failed ? (
        <div role="alert" className="flex flex-col items-start gap-2 text-err">
          <p>{t("dashboard.failed")}</p>
          <Button variant="ghost" onClick={dashboard.reload}>
            {t("common.retry")}
          </Button>
        </div>
      ) : dashboard.data === null ? (
        <p role="status" className="py-6 text-muted">
          {t("common.loading")}
        </p>
      ) : (
        <PeopleCard d={dashboard.data} allowances={allowances.data} onAllocate={setAllocating} />
      )}
      <AllowanceSheet
        person={allocating}
        month={month}
        onClose={() => setAllocating(null)}
        onSaved={() => {
          setAllocating(null);
          allowances.reload();
          dashboard.reload();
        }}
      />
    </section>
  );
}
