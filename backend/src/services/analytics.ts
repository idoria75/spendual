import type { Prisma, PrismaClient } from "@prisma/client";
import type { CategoryTrends, TrendSeries } from "@spendual/shared";
import { centsToMoney, moneyToCents } from "../domain/accounting.js";
import { currentPeriod, dateOnlyToDate, nextPeriod } from "../lib/period.js";
import { budgetKey } from "./budget.js";

type Db = PrismaClient | Prisma.TransactionClient;

/** Longest range, and how far back it may start. Plenty for a household; the query stays small. */
export const MAX_TREND_MONTHS = 60;

const cents = (d: Prisma.Decimal): bigint => moneyToCents(d.toFixed(2));

/** "YYYY-MM" keys from `from` to `to`, both included. */
export function monthsBetween(from: string, to: string): string[] {
  const months: string[] = [];
  for (let m = from; m <= to; m = nextPeriod(m)) months.push(m);
  return months;
}

/**
 * Household spending per month and category over a range, with the budget in force each month.
 * Confirmed expenses minus their linked confirmed refunds; a refund counts in its expense's month.
 */
export async function getCategoryTrends(
  db: Db,
  from: string,
  to: string,
  now: Date = new Date(),
): Promise<CategoryTrends> {
  const months = monthsBetween(from, to);
  const current = currentPeriod(now);
  const where = {
    scope: "household" as const,
    type: "expense" as const,
    transactionDate: {
      gte: dateOnlyToDate(`${from}-01`),
      lt: dateOnlyToDate(`${nextPeriod(to)}-01`),
    },
  };
  const [expenses, refunds, budgetRows, categories] = await Promise.all([
    db.transaction.findMany({
      where: { status: "confirmed", ...where },
      select: { amount: true, categoryId: true, transactionDate: true },
    }),
    db.transaction.findMany({
      where: {
        status: "confirmed",
        type: "refund",
        relatedTransaction: { is: { status: "confirmed", ...where } },
      },
      select: {
        amount: true,
        relatedTransaction: { select: { categoryId: true, transactionDate: true } },
      },
    }),
    db.monthlyBudget.findMany({
      where: { effectiveFrom: { lte: to } },
      orderBy: { effectiveFrom: "asc" },
    }),
    db.category.findMany({ where: { kind: "expense" }, orderBy: { id: "asc" } }),
  ]);

  // spent.get(categoryKey).get(month): cents. categoryKey is the id as text, "none" for null.
  const spent = new Map<string, Map<string, bigint>>();
  const add = (categoryId: number | null, date: Date, amount: bigint) => {
    const key = categoryId === null ? "none" : String(categoryId);
    const month = date.toISOString().slice(0, 7);
    const perMonth = spent.get(key) ?? new Map<string, bigint>();
    perMonth.set(month, (perMonth.get(month) ?? 0n) + amount);
    spent.set(key, perMonth);
  };
  for (const e of expenses) add(e.categoryId, e.transactionDate, cents(e.amount));
  for (const r of refunds) {
    if (r.relatedTransaction) {
      add(r.relatedTransaction.categoryId, r.relatedTransaction.transactionDate, -cents(r.amount));
    }
  }

  // Budget in force at a month: the last row (rows are oldest first) with effectiveFrom <= month.
  const budgetAt = (categoryKey: string, month: string): string | null => {
    let found: string | null = null;
    for (const b of budgetRows) {
      if (b.categoryKey === categoryKey && b.effectiveFrom <= month) found = b.amount.toFixed(2);
    }
    return found;
  };

  const series = (
    categoryId: number | null,
    amountAt: (month: string) => bigint,
    budgetCategoryKey: string | null,
  ): TrendSeries => ({
    categoryId,
    points: months.map((month) => ({
      month,
      amount: centsToMoney(amountAt(month)),
      budget: budgetCategoryKey === null ? null : budgetAt(budgetCategoryKey, month),
      partial: month === current,
    })),
  });

  const total = (month: string) =>
    [...spent.values()].reduce((sum, perMonth) => sum + (perMonth.get(month) ?? 0n), 0n);
  const own = (key: string) => (month: string) => spent.get(key)?.get(month) ?? 0n;

  const listed = categories
    .filter(
      (c) => spent.has(String(c.id)) || budgetRows.some((b) => b.categoryKey === String(c.id)),
    )
    .map((c) => series(c.id, own(String(c.id)), budgetKey(c.id).categoryKey));
  if (spent.has("none")) listed.push(series(null, own("none"), null));

  return {
    from,
    to,
    overall: series(null, total, budgetKey(null).categoryKey),
    categories: listed,
  };
}
