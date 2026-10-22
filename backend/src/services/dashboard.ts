import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  AllowanceOverview,
  Bill,
  BudgetLine,
  BudgetOverview,
  Dashboard,
  PersonSummary,
} from "@spendual/shared";
import {
  centsToMoney,
  moneyToCents,
  netExpenses,
  personalClosingBalance,
  savingsBeforeGoals,
  savingsRate,
  unallocatedSavings,
} from "../domain/accounting.js";
import { AppError } from "../auth/errors.js";
import {
  addPeriods,
  currentDate,
  currentPeriod,
  dateOnlyToDate,
  daysInMonth,
  nextPeriod,
  parsePeriod,
} from "../lib/period.js";
import { withRetry } from "../lib/withRetry.js";
import { SAVINGS_KEY, budgetFor, budgetKey } from "./budget.js";
import { installmentBill, recurrenceBill } from "./bills.js";
import { generateForRules } from "./recurrence.js";

type Db = PrismaClient | Prisma.TransactionClient;
interface Range {
  gte?: Date;
  lt: Date;
}

const cents = (d: Prisma.Decimal | null | undefined): bigint =>
  d ? moneyToCents(d.toFixed(2)) : 0n;

const monthRange = (month: string): Range => ({
  gte: dateOnlyToDate(`${month}-01`),
  lt: dateOnlyToDate(`${nextPeriod(month)}-01`),
});
const before = (month: string): Range => ({ lt: dateOnlyToDate(`${month}-01`) });

async function sumTx(db: Db, where: Prisma.TransactionWhereInput): Promise<bigint> {
  const agg = await db.transaction.aggregate({
    _sum: { amount: true },
    where: { status: "confirmed", ...where },
  });
  return cents(agg._sum.amount);
}

/**
 * Expenses in the range minus the confirmed refunds linked to those expenses.
 * A refund counts in the month of its expense, whatever its own date.
 */
async function netSpent(
  db: Db,
  expenseWhere: Prisma.TransactionWhereInput,
  range: Range,
): Promise<bigint> {
  const where = { ...expenseWhere, type: "expense" as const, transactionDate: range };
  const [expenses, refunds] = await Promise.all([
    sumTx(db, where),
    sumTx(db, { type: "refund", relatedTransaction: { is: { status: "confirmed", ...where } } }),
  ]);
  return netExpenses(expenses, refunds);
}

/**
 * Create missing planned occurrences for every active rule. Idempotent.
 * Never looks at past months: generation starts at the later of `month` and today's month.
 * Rules are locked and read once, then one INSERT IGNORE runs, so a rule edit that
 * commits first is seen here, and one that waits sees the new rows.
 */
export async function generateForAllRules(
  prisma: PrismaClient,
  month: string,
  now: Date = new Date(),
): Promise<void> {
  const cur = currentPeriod(now);
  const from = month < cur ? cur : month;
  await withRetry(() =>
    prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM RecurrenceRule WHERE state = 'active' ORDER BY id FOR UPDATE`;
      const rules = await tx.recurrenceRule.findMany({ where: { state: "active" } });
      await generateForRules(tx, rules, from);
    }),
  );
}

export async function personSummaries(db: Db, month: string): Promise<PersonSummary[]> {
  const users = await db.user.findMany({ where: { active: true }, orderBy: { id: "asc" } });
  const range = monthRange(month);
  return Promise.all(users.map((u) => personSummary(db, u.id, month, range)));
}

async function personSummary(
  db: Db,
  userId: number,
  month: string,
  range: Range,
): Promise<PersonSummary> {
  const own = { scope: "personal" as const, ownerId: userId };
  const credits = (r: Range) =>
    sumTx(db, { ...own, type: { in: ["income", "other_receipt"] }, transactionDate: r });
  const allowances = async (where: Prisma.PersonalAllowanceEntryWhereInput) => {
    const agg = await db.personalAllowanceEntry.aggregate({
      _sum: { amount: true },
      where: { ownerId: userId, ...where },
    });
    return cents(agg._sum.amount);
  };
  const [openAllow, openCredits, openSpent, allowance, personalCredits, personalSpent] =
    await Promise.all([
      allowances({ periodKey: { lt: month } }),
      credits(before(month)),
      netSpent(db, own, before(month)),
      allowances({ periodKey: month }),
      credits(range),
      netSpent(db, own, range),
    ]);
  const closing = personalClosingBalance({
    opening: openAllow + openCredits - openSpent,
    allowanceAllocations: allowance,
    personalCredits,
    personalExpensesNet: personalSpent,
  });
  return {
    userId,
    allowanceAllocated: centsToMoney(allowance),
    personalSpent: centsToMoney(personalSpent),
    personalCredits: centsToMoney(personalCredits),
    closingBalance: centsToMoney(closing),
  };
}

/**
 * Household confirmed expenses by category for the month, net of linked refunds
 * (a refund counts in its expense's month). Biggest first. null = no category.
 * The amounts add up to the household net spent.
 */
export async function categorySpending(
  db: Db,
  month: string,
): Promise<{ categoryId: number | null; amount: string }[]> {
  const where = {
    scope: "household" as const,
    type: "expense" as const,
    transactionDate: monthRange(month),
  };
  const [expenses, refunds] = await Promise.all([
    db.transaction.groupBy({
      by: ["categoryId"],
      _sum: { amount: true },
      where: { status: "confirmed", ...where },
    }),
    db.transaction.findMany({
      where: {
        status: "confirmed",
        type: "refund",
        relatedTransaction: { is: { status: "confirmed", ...where } },
      },
      select: { amount: true, relatedTransaction: { select: { categoryId: true } } },
    }),
  ]);
  const byCategory = new Map<number | null, bigint>();
  for (const e of expenses) byCategory.set(e.categoryId, cents(e._sum.amount));
  for (const r of refunds) {
    const id = r.relatedTransaction?.categoryId ?? null;
    byCategory.set(id, (byCategory.get(id) ?? 0n) - cents(r.amount));
  }
  return [...byCategory.entries()]
    .sort(([ka, a], [kb, b]) => (a === b ? (ka ?? 0) - (kb ?? 0) : a > b ? -1 : 1))
    .map(([categoryId, amount]) => ({ categoryId, amount: centsToMoney(amount) }));
}

/** Next 5 planned bills due today or later. Rules must be active. Soonest first. */
export async function upcomingBills(db: Db, now: Date): Promise<Bill[]> {
  const dueDate = { gte: dateOnlyToDate(currentDate(now)) };
  const [rec, ins] = await Promise.all([
    db.recurrenceOccurrence.findMany({
      where: { status: "planned", dueDate, rule: { state: "active" } },
      include: { rule: true, transaction: { select: { id: true } } },
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
      take: 5,
    }),
    db.installmentOccurrence.findMany({
      where: { status: "planned", dueDate },
      include: { plan: true, transaction: { select: { id: true } } },
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
      take: 5,
    }),
  ]);
  return [...rec.map(recurrenceBill), ...ins.map(installmentBill)]
    .sort(
      (a, b) => a.dueDate.localeCompare(b.dueDate) || a.kind.localeCompare(b.kind) || a.id - b.id,
    )
    .slice(0, 5);
}

export async function getDashboard(
  prisma: PrismaClient,
  month: string,
  now: Date = new Date(),
): Promise<Dashboard> {
  await generateForAllRules(prisma, month, now);
  // Upcoming starts today, so this month needs rows even when a later month is shown.
  if (month > currentPeriod(now)) await generateForAllRules(prisma, currentPeriod(now), now);
  const range = monthRange(month);
  const household = { scope: "household" as const };
  const planned = { status: "planned" as const, dueDate: range };
  const [
    income,
    sharedNet,
    people,
    allocationAgg,
    recAgg,
    recUnknown,
    insAgg,
    overall,
    target,
    spending,
    upcoming,
    goalSums,
  ] = await Promise.all([
    sumTx(prisma, { ...household, type: "income", transactionDate: range }),
    netSpent(prisma, household, range),
    personSummaries(prisma, month),
    // Every user counts here, active or not: the household already paid these out.
    prisma.personalAllowanceEntry.aggregate({
      _sum: { amount: true },
      where: { periodKey: month },
    }),
    prisma.recurrenceOccurrence.aggregate({ _sum: { expectedAmount: true }, where: planned }),
    prisma.recurrenceOccurrence.count({ where: { ...planned, expectedAmount: null } }),
    prisma.installmentOccurrence.aggregate({ _sum: { expectedAmount: true }, where: planned }),
    budgetFor(prisma, null, month),
    budgetFor(prisma, null, month, true),
    categorySpending(prisma, month),
    upcomingBills(prisma, now),
    goalEntrySums(prisma, range),
  ]);
  const allocations = cents(allocationAgg._sum.amount);
  const savings = savingsBeforeGoals({
    householdIncome: income,
    sharedExpensesNet: sharedNet,
    allowanceAllocations: allocations,
  });
  const goalNet = goalSums.allocated - goalSums.withdrawn;
  return {
    month,
    householdIncome: centsToMoney(income),
    sharedExpensesNet: centsToMoney(sharedNet),
    allowanceAllocations: centsToMoney(allocations),
    savingsBeforeGoals: centsToMoney(savings),
    goalAllocationsNet: centsToMoney(goalNet),
    unallocatedSavings: centsToMoney(unallocatedSavings(savings, goalNet)),
    savingsRate: savingsRate(savings, income),
    plannedBillsTotal: centsToMoney(
      cents(recAgg._sum.expectedAmount) + cents(insAgg._sum.expectedAmount),
    ),
    plannedBillsUnknownCount: recUnknown,
    overallBudget: {
      budget: overall ? overall.amount.toFixed(2) : null,
      spent: centsToMoney(sharedNet),
    },
    savingsTarget: target ? target.amount.toFixed(2) : null,
    pace: await spendingPace(prisma, month, now),
    categorySpending: spending,
    upcoming,
    people,
  };
}

/**
 * Household spending of the current month up to today, against the same days of last month.
 * null for any other month. A short last month is clamped (day 31 on a 30 day month).
 */
async function spendingPace(db: Db, month: string, now: Date): Promise<Dashboard["pace"]> {
  if (month !== currentPeriod(now)) return null;
  const day = Number(currentDate(now).slice(8, 10));
  const last = addPeriods(month, -1);
  const { year, month: m } = parsePeriod(last);
  const lastDay = Math.min(day, daysInMonth(year, m));
  const upTo = (period: string, days: number): Range => {
    const start = monthRange(period);
    return {
      gte: start.gte as Date,
      lt: new Date((start.gte as Date).getTime() + days * 86_400_000),
    };
  };
  const household = { scope: "household" as const };
  const [spent, lastSame, lastTotal] = await Promise.all([
    netSpent(db, household, upTo(month, day)),
    netSpent(db, household, upTo(last, lastDay)),
    netSpent(db, household, monthRange(last)),
  ]);
  return {
    day,
    spent: centsToMoney(spent),
    lastMonthSameDays: centsToMoney(lastSame),
    lastMonthTotal: centsToMoney(lastTotal),
  };
}

/** Goal ALLOCATION and WITHDRAWAL totals by effectiveDate. Not income, not expense. */
async function goalEntrySums(db: Db, range: Range) {
  const rows = await db.goalEntry.groupBy({
    by: ["kind"],
    where: { kind: { in: ["ALLOCATION", "WITHDRAWAL"] }, effectiveDate: range },
    _sum: { amount: true },
  });
  const sum = (kind: string) => cents(rows.find((r) => r.kind === kind)?._sum.amount);
  return { allocated: sum("ALLOCATION"), withdrawn: sum("WITHDRAWAL") };
}

/**
 * Savings of a month not yet in a goal (Appendix A), from the ledgers only. Same numbers as
 * getDashboard, without generating bills. Used to refuse an allocation above it.
 */
export async function unallocatedForMonth(db: Db, month: string): Promise<bigint> {
  const [savings, goals] = await Promise.all([
    savingsOfMonth(db, month),
    goalEntrySums(db, monthRange(month)),
  ]);
  return unallocatedSavings(savings, goals.allocated - goals.withdrawn);
}

/** Savings before goals (Sobra do mês): income - shared expenses - allowances, ledgers only. */
export async function savingsOfMonth(db: Db, month: string): Promise<bigint> {
  const range = monthRange(month);
  const household = { scope: "household" as const };
  const [income, sharedNet, allowanceAgg] = await Promise.all([
    sumTx(db, { ...household, type: "income", transactionDate: range }),
    netSpent(db, household, range),
    db.personalAllowanceEntry.aggregate({ _sum: { amount: true }, where: { periodKey: month } }),
  ]);
  return savingsBeforeGoals({
    householdIncome: income,
    sharedExpensesNet: sharedNet,
    allowanceAllocations: cents(allowanceAgg._sum.amount),
  });
}

export async function getBudgetOverview(db: Db, month: string): Promise<BudgetOverview> {
  const range = monthRange(month);
  const household = { scope: "household" as const };
  const where = { ...household, type: "expense" as const, transactionDate: range };

  const [expenses, refunds, categories, overallSpent, budgetRows, saved] = await Promise.all([
    db.transaction.groupBy({
      by: ["categoryId"],
      _sum: { amount: true },
      where: { status: "confirmed", ...where },
    }),
    db.transaction.findMany({
      where: {
        status: "confirmed",
        type: "refund",
        relatedTransaction: { is: { status: "confirmed", ...where } },
      },
      select: { amount: true, relatedTransaction: { select: { categoryId: true } } },
    }),
    db.category.findMany({ where: { kind: "expense" }, orderBy: { id: "asc" } }),
    netSpent(db, household, range),
    db.monthlyBudget.findMany({
      where: { effectiveFrom: { lte: month } },
      orderBy: { effectiveFrom: "desc" },
    }),
    savingsOfMonth(db, month),
  ]);

  // Rows come newest first, so the first one per key is the budget in force.
  const inForce = (key: string) => budgetRows.find((b) => b.categoryKey === key) ?? null;
  const overall = inForce(budgetKey(null).categoryKey);
  const spent = new Map<number, bigint>();
  for (const e of expenses) {
    if (e.categoryId != null) spent.set(e.categoryId, cents(e._sum.amount));
  }
  for (const r of refunds) {
    const id = r.relatedTransaction?.categoryId;
    if (id != null) spent.set(id, (spent.get(id) ?? 0n) - cents(r.amount));
  }

  const lines: BudgetLine[] = [];
  for (const c of categories) {
    const b = inForce(budgetKey(c.id).categoryKey);
    const s = spent.get(c.id) ?? 0n;
    // Archived categories only show while they still have a budget or spending.
    if (!c.active && !b && s === 0n) continue;
    lines.push({
      categoryId: c.id,
      amount: b ? b.amount.toFixed(2) : null,
      spent: centsToMoney(s),
    });
  }
  return {
    month,
    overall: {
      categoryId: null,
      amount: overall ? overall.amount.toFixed(2) : null,
      spent: centsToMoney(overallSpent),
    },
    categories: lines,
    savings: {
      categoryId: null,
      amount: inForce(SAVINGS_KEY)?.amount.toFixed(2) ?? null,
      spent: centsToMoney(saved),
    },
  };
}

export async function assertBudgetCategory(db: Db, categoryId: number | null): Promise<void> {
  if (categoryId === null) return;
  const c = await db.category.findUnique({ where: { id: categoryId } });
  if (!c) {
    throw new AppError(400, "validation_error", "Invalid request", {
      categoryId: "Unknown category",
    });
  }
  if (c.kind !== "expense") {
    throw new AppError(400, "validation_error", "Invalid request", {
      categoryId: "Must be an expense category",
    });
  }
}

export async function getAllowanceOverview(db: Db, month: string): Promise<AllowanceOverview> {
  const [people, rows] = await Promise.all([
    personSummaries(db, month),
    db.personalAllowanceEntry.findMany({ where: { periodKey: month, kind: "ALLOCATION" } }),
  ]);
  return {
    month,
    people: people.map((p) => {
      const row = rows.find((r) => r.ownerId === p.userId);
      return {
        ownerId: p.userId,
        allocation: row ? row.amount.toFixed(2) : null,
        closingBalance: p.closingBalance,
      };
    }),
  };
}
