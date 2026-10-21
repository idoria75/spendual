import type { TrendPoint } from "@spendual/shared";
import { shiftMonth } from "../../lib/date";
import { toCents } from "../../lib/currency";

export const RANGES = [6, 12] as const;
export type RangeMonths = (typeof RANGES)[number];
/** A preset number of months, or two months chosen by the person. */
export type RangeChoice = RangeMonths | "custom";

/** How far back the pickers go. Same limit as the API. */
export const MAX_BACK_MONTHS = 60;

/** Months for the pickers, newest first, from the current month back. */
export function monthOptions(current: string, back: number = MAX_BACK_MONTHS): string[] {
  return Array.from({ length: back + 1 }, (_, i) => shiftMonth(current, -i));
}

/** A custom window is valid when `from <= to <= current`. Otherwise null. */
export function customWindow(
  from: string,
  to: string,
  current: string,
): { from: string; to: string } | null {
  return from <= to && to <= current ? { from, to } : null;
}

/** The window ends at the selected month, or at the current month when that is later. */
export function trendWindow(
  selected: string,
  current: string,
  months: RangeMonths,
): { from: string; to: string } {
  const to = selected > current ? current : selected;
  return { from: shiftMonth(to, -(months - 1)), to };
}

/** Months that count for the average: closed ones. The month in progress is left out. */
export const closedPoints = (points: TrendPoint[]): TrendPoint[] =>
  points.filter((p) => !p.partial);

/**
 * Months that feed the average: closed months from the first one with spending. Months before
 * that are empty because the household had not started yet, and they would pull the average down.
 */
export function averagedPoints(points: TrendPoint[]): TrendPoint[] {
  const closed = closedPoints(points);
  const first = closed.findIndex((p) => toCents(p.amount) !== 0n);
  return first === -1 ? [] : closed.slice(first);
}

/** Average in cents, rounded half up. null when no month feeds it. */
export function averageCents(points: TrendPoint[]): bigint | null {
  const used = averagedPoints(points);
  if (used.length === 0) return null;
  const sum = used.reduce((total, p) => total + toCents(p.amount), 0n);
  const n = BigInt(used.length);
  return (sum * 2n + n) / (2n * n);
}

/** Budget minus spent for one month. A month without a budget counts 0. */
export const netVsBudget = (p: TrendPoint): bigint =>
  p.budget === null ? 0n : toCents(p.budget) - toCents(p.amount);

/**
 * Running sum of budget minus spent. It starts at the first closed month with spending (the same
 * months as the average) and leaves out the month in progress. Those months have no entry.
 */
export function cumulativeNet(points: TrendPoint[]): Map<string, bigint> {
  const out = new Map<string, bigint>();
  let sum = 0n;
  for (const p of averagedPoints(points)) {
    sum += netVsBudget(p);
    out.set(p.month, sum);
  }
  return out;
}

/** Total over the period and how many of its months had a budget. null when no month counts. */
export function periodNet(points: TrendPoint[]): { total: bigint; months: number } | null {
  const used = averagedPoints(points);
  if (used.length === 0) return null;
  return {
    total: used.reduce((sum, p) => sum + netVsBudget(p), 0n),
    months: used.filter((p) => p.budget !== null).length,
  };
}

/** Over budget: spent more than the budget in force that month. No budget is never over. */
export const isOver = (p: TrendPoint): boolean =>
  p.budget !== null && toCents(p.amount) > toCents(p.budget);

/** Closed months over budget, out of the closed months that had a budget. */
export function monthsAbove(points: TrendPoint[]): { above: number; withBudget: number } {
  const counted = closedPoints(points).filter((p) => p.budget !== null);
  return { above: counted.filter(isOver).length, withBudget: counted.length };
}

/** Top of the y axis and the tick step, in whole reais. At most 5 steps. Integer math only. */
export function axisScale(topCents: bigint): { max: number; step: number } {
  const steps = [10, 20, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 50000];
  // 8 percent of head room above the biggest mark, at least 1 real.
  const target = ((topCents > 100n ? topCents : 100n) * 108n) / 100n;
  const step = steps.find((x) => target <= BigInt(x) * 500n) ?? 100000;
  const stepCents = BigInt(step) * 100n;
  const max = ((target + stepCents - 1n) / stepCents) * BigInt(step);
  return { max: Number(max), step };
}

/** Cents rounded to whole reais, half away from zero. For chart labels only. */
export const wholeReais = (value: bigint): bigint =>
  value < 0n ? -((-value + 50n) / 100n) : (value + 50n) / 100n;

const shortMonthFmt = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" });

/** "2026-10" -> "Out" */
export function shortMonth(month: string): string {
  const [y = "0", m = "1"] = month.split("-");
  const text = shortMonthFmt
    .format(new Date(Date.UTC(Number(y), Number(m) - 1, 1)))
    .replace(".", "");
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

/** "2026-05", "2026-10" -> "Mai – Out 2026" (years on both ends when they differ). */
export function formatRange(from: string, to: string): string {
  const yf = from.slice(0, 4);
  const yt = to.slice(0, 4);
  return yf === yt
    ? `${shortMonth(from)} – ${shortMonth(to)} ${yt}`
    : `${shortMonth(from)} ${yf} – ${shortMonth(to)} ${yt}`;
}
