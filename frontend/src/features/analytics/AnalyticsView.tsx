import type { TrendSeries } from "@spendual/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/button";
import { Chip } from "../../components/ui/chip";
import { Segmented } from "../../components/ui/segmented";
import { cn } from "../../lib/cn";
import { formatMoney, fromCents, toCents } from "../../lib/currency";
import { currentMonth } from "../../lib/date";
import { fetchCategoryTrends } from "../planning/api";
import { useLoad } from "../planning/use-load";
import { categoryColor } from "../transactions/CategoryTile";
import { useLookups } from "../transactions/lookups";
import { useMonth } from "../transactions/month";
import { TrendChart } from "./TrendChart";
import {
  RANGES,
  averageCents,
  averagedPoints,
  formatRange,
  isOver,
  monthsAbove,
  shortMonth,
  trendWindow,
  type RangeMonths,
} from "./trend";

/** "all" is the household total; a number is a category id; "none" has no category. */
type Selection = "all" | "none" | number;

const seriesKey = (s: TrendSeries): Selection => s.categoryId ?? "none";
const total = (s: TrendSeries): bigint => s.points.reduce((sum, p) => sum + toCents(p.amount), 0n);

function Stat({ value, label, warn }: { value: string; label: string; warn?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-[2px] rounded-input bg-surface p-3">
      <b className={cn("whitespace-nowrap tabular-nums", warn && "text-warn")}>{value}</b>
      <span className="text-[0.72rem] text-muted">{label}</span>
    </div>
  );
}

function LegendLine({ kind }: { kind: "avg" | "budget" }) {
  return (
    <svg aria-hidden viewBox="0 0 22 10" className="h-[10px] w-[22px] shrink-0">
      <line
        x1="0"
        x2="22"
        y1="5"
        y2="5"
        stroke={kind === "avg" ? "var(--fg)" : "var(--muted)"}
        strokeOpacity={kind === "avg" ? 1 : 0.7}
        strokeWidth={kind === "avg" ? 1.6 : 2.5}
        strokeDasharray={kind === "avg" ? "5 3" : undefined}
      />
    </svg>
  );
}

/** Análises: spending per category month by month, with the average and the budget. */
export function AnalyticsView() {
  const { t } = useTranslation();
  const { month } = useMonth();
  const { data: lookups } = useLookups();
  const [range, setRange] = useState<RangeMonths>(6);
  const [selected, setSelected] = useState<Selection>("all");
  const current = currentMonth();
  const { from, to } = trendWindow(month, current, range);
  const { data, failed, reload } = useLoad(() => fetchCategoryTrends(from, to), [from, to]);

  const nameOf = (id: number | null): string =>
    id === null
      ? t("list.noCategory")
      : (lookups?.categories.find((c) => c.id === id)?.name ?? t("list.noCategory"));

  const categories = data
    ? [...data.categories].sort((a, b) => (total(a) > total(b) ? -1 : 1))
    : [];
  const series: TrendSeries | undefined =
    data === null
      ? undefined
      : selected === "all"
        ? data.overall
        : (categories.find((s) => seriesKey(s) === selected) ?? data.overall);
  const isAll = series !== undefined && series === data?.overall;
  const effective: Selection = series === undefined || isAll ? "all" : seriesKey(series);
  const color = isAll ? "var(--accent)" : categoryColor(series?.categoryId ?? null);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[17px] font-bold">{t("analytics.title")}</h1>
          <p className="text-[0.85rem] text-muted">{t("analytics.subtitle")}</p>
        </div>
        <div className="w-[9.5rem] shrink-0">
          <Segmented
            label={t("analytics.range")}
            value={String(range)}
            options={RANGES.map((n) => ({
              value: String(n),
              label: t("analytics.months", { count: n }),
            }))}
            onChange={(v) => setRange(Number(v) as RangeMonths)}
          />
        </div>
      </div>

      {failed ? (
        <div role="alert" className="flex flex-col items-start gap-2 text-err">
          <p>{t("analytics.failed")}</p>
          <Button variant="ghost" onClick={reload}>
            {t("common.retry")}
          </Button>
        </div>
      ) : data === null || series === undefined ? (
        <p role="status" className="py-6 text-muted">
          {t("common.loading")}
        </p>
      ) : (
        <>
          <div
            role="group"
            aria-label={t("analytics.category")}
            className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1"
          >
            <Chip active={effective === "all"} onClick={() => setSelected("all")}>
              {t("analytics.all")}
            </Chip>
            {categories.map((s) => (
              <Chip
                key={seriesKey(s)}
                active={effective === seriesKey(s)}
                onClick={() => setSelected(seriesKey(s))}
              >
                {nameOf(s.categoryId)}
              </Chip>
            ))}
          </div>
          <Details
            series={series}
            title={isAll ? t("analytics.all") : nameOf(series.categoryId)}
            color={color}
            from={from}
            to={to}
            hasData={total(data.overall) > 0n}
          />
        </>
      )}
    </section>
  );
}

function Details({
  series,
  title,
  color,
  from,
  to,
  hasData,
}: {
  series: TrendSeries;
  title: string;
  color: string;
  from: string;
  to: string;
  hasData: boolean;
}) {
  const { t } = useTranslation();
  const points = series.points;
  const avg = averageCents(points);
  const last = points[points.length - 1];
  const { above, withBudget } = monthsAbove(points);
  const hasBudget = points.some((p) => p.budget !== null);

  if (!hasData) {
    return (
      <p className="rounded-card bg-surface p-4 text-[0.85rem] text-muted">
        {t("analytics.empty")}
      </p>
    );
  }
  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <Stat
          value={avg === null ? "–" : formatMoney(fromCents(avg))}
          label={t("analytics.average", { count: averagedPoints(points).length })}
        />
        <Stat
          value={last?.budget ? formatMoney(last.budget) : "–"}
          label={last?.budget ? t("analytics.budgetNow") : t("budgets.none")}
        />
        <Stat
          value={withBudget === 0 ? "–" : t("analytics.aboveOf", { above, count: withBudget })}
          label={t("analytics.monthsAbove")}
          warn={above > 0}
        />
      </div>

      <section aria-label={title} className="flex flex-col gap-2 rounded-card bg-surface p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-bold">{title}</h2>
          <span className="whitespace-nowrap text-[0.78rem] text-muted">
            {formatRange(from, to)}
          </span>
        </div>
        <TrendChart
          points={points}
          color={color}
          label={t("analytics.chartLabel", { name: title, range: formatRange(from, to) })}
        />
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[0.78rem] text-muted">
          <span className="inline-flex items-center gap-2">
            <svg aria-hidden viewBox="0 0 22 10" className="h-[10px] w-[22px] shrink-0">
              <rect x="3" width="16" height="10" rx="2" style={{ fill: color }} />
            </svg>
            {t("analytics.legendSpent")}
          </span>
          <span className="inline-flex items-center gap-2">
            <LegendLine kind="avg" />
            {t("analytics.legendAverage")}
          </span>
          {hasBudget ? (
            <span className="inline-flex items-center gap-2">
              <LegendLine kind="budget" />
              {t("analytics.legendBudget")}
            </span>
          ) : null}
        </div>
        <p className="text-[0.78rem] text-muted">{t("analytics.partialNote")}</p>
      </section>

      <section aria-label={t("analytics.byMonth")} className="rounded-card bg-surface p-4">
        <h2 className="font-bold">{t("analytics.byMonth")}</h2>
        <ul className="mt-2 flex flex-col">
          {[...points].reverse().map((p) => {
            const diff = p.budget === null ? null : toCents(p.amount) - toCents(p.budget);
            // Money saved shows in green once the month is closed. The month in progress is not final.
            const saved = diff !== null && diff < 0n && !p.partial;
            return (
              <li
                key={p.month}
                className="grid grid-cols-[3.2rem_1fr_auto] items-center gap-3 border-t border-line py-2 text-[0.88rem] first:border-t-0"
              >
                <span className="text-muted">
                  {shortMonth(p.month)}
                  {p.partial ? "*" : ""}
                </span>
                <span className="font-semibold tabular-nums">{formatMoney(p.amount)}</span>
                <span
                  className={cn(
                    "whitespace-nowrap text-right text-[0.78rem] tabular-nums text-muted",
                    isOver(p) && "font-semibold text-warn",
                    saved && "font-semibold text-pos",
                  )}
                >
                  {diff === null
                    ? t("budgets.none")
                    : diff > 0n
                      ? t("budgets.over", { amount: formatMoney(fromCents(diff)) })
                      : diff === 0n
                        ? t("analytics.onBudget")
                        : t("analytics.below", { amount: formatMoney(fromCents(-diff)) })}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
