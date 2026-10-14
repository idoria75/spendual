import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  AllowanceOverview,
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
import { dateOnlyToDate, nextPeriod } from "../lib/period.js";
import { budgetFor } from "./budget.js";
import { generateOccurrences } from "./recurrence.js";

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

/** Create missing planned occurrences for every active rule, from `month` on. Idempotent. */
export async function generateForAllRules(prisma: PrismaClient, month: string): Promise<void> {
  const rules = await prisma.recurrenceRule.findMany({
    where: { state: "active" },
    select: { id: true },
  });
  for (const r of rules) await generateOccurrences(prisma, r.id, month);
}

export async function personSummaries(db: Db, month: string): Promise<PersonSummary[]> {
  const users = await db.user.findMany({ where: { active: true }, orderBy: { id: "asc" } });
  const range = monthRange(month);
  const out: PersonSummary[] = [];
  for (const u of users) {
    const own = { scope: "personal" as const, ownerId: u.id };
    const credits = (r: Range) =>
      sumTx(db, { ...own, type: { in: ["income", "other_receipt"] }, transactionDate: r });
    const allowances = async (where: Prisma.PersonalAllowanceEntryWhereInput) => {
      const agg = await db.personalAllowanceEntry.aggregate({
        _sum: { amount: true },
        where: { ownerId: u.id, ...where },
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
    out.push({
      userId: u.id,
      allowanceAllocated: centsToMoney(allowance),
      personalSpent: centsToMoney(personalSpent),
      personalCredits: centsToMoney(personalCredits),
      closingBalance: centsToMoney(closing),
    });
  }
  return out;
}

export async function getDashboard(prisma: PrismaClient, month: string): Promise<Dashboard> {
  await generateForAllRules(prisma, month);
  const range = monthRange(month);
  const household = { scope: "household" as const };
  const planned = { status: "planned" as const, dueDate: range };
  const [income, sharedNet, people, recAgg, recUnknown, insAgg, overall] = await Promise.all([
    sumTx(prisma, { ...household, type: "income", transactionDate: range }),
    netSpent(prisma, household, range),
    personSummaries(prisma, month),
    prisma.recurrenceOccurrence.aggregate({ _sum: { expectedAmount: true }, where: planned }),
    prisma.recurrenceOccurrence.count({ where: { ...planned, expectedAmount: null } }),
    prisma.installmentOccurrence.aggregate({ _sum: { expectedAmount: true }, where: planned }),
    budgetFor(prisma, null, month),
  ]);
  const allocations = people.reduce((a, p) => a + moneyToCents(p.allowanceAllocated), 0n);
  const savings = savingsBeforeGoals({
    householdIncome: income,
    sharedExpensesNet: sharedNet,
    allowanceAllocations: allocations,
  });
  const goalNet = 0n; // Goals are not in P0.
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
    people,
  };
}

export async function getBudgetOverview(db: Db, month: string): Promise<BudgetOverview> {
  const range = monthRange(month);
  const household = { scope: "household" as const };
  const where = { ...household, type: "expense" as const, transactionDate: range };

  const [expenses, refunds, categories, overall, overallSpent] = await Promise.all([
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
    db.category.findMany({ orderBy: { id: "asc" } }),
    budgetFor(db, null, month),
    netSpent(db, household, range),
  ]);

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
    const b = await budgetFor(db, c.id, month);
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
