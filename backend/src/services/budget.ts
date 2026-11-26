import { Prisma, type BudgetScope, type PrismaClient } from "@prisma/client";
import { HOUSEHOLD_ID } from "../lib/household.js";
import { nextPeriod } from "../lib/period.js";
import { withRetry } from "../lib/withRetry.js";

export type BudgetEditMode = "going_forward" | "this_period_only";

export interface EditBudgetInput {
  /** null for the overall household budget (or the savings target, see `savings`) */
  categoryId: number | null;
  /** true: edit the monthly savings target instead of a spending budget */
  savings?: boolean;
  period: string;
  amount: string;
  mode: BudgetEditMode;
  actorId?: number;
}

export const SAVINGS_KEY = "savings";

export function budgetKey(
  categoryId: number | null,
  savings = false,
): { scope: BudgetScope; categoryKey: string } {
  if (savings) return { scope: "SAVINGS", categoryKey: SAVINGS_KEY };
  return categoryId === null
    ? { scope: "OVERALL", categoryKey: "overall" }
    : { scope: "CATEGORY", categoryKey: String(categoryId) };
}

/** Budget in force for a period: the latest row with effectiveFrom <= period. */
export async function budgetFor(
  db: PrismaClient | Prisma.TransactionClient,
  categoryId: number | null,
  period: string,
  savings = false,
) {
  return db.monthlyBudget.findFirst({
    where: {
      categoryKey: budgetKey(categoryId, savings).categoryKey,
      effectiveFrom: { lte: period },
    },
    orderBy: { effectiveFrom: "desc" },
  });
}

/**
 * Edit a budget at period P, in one transaction. Past periods are never changed.
 * Runs under a lock on the Household row, so racing edits run one at a time.
 * - going_forward: upsert the row at P.
 * - this_period_only: upsert the row at P. Then, only if no row exists at P+1,
 *   insert one at P+1 with the amount that was in force before the edit.
 */
export function editBudget(prisma: PrismaClient, input: EditBudgetInput): Promise<void> {
  const { scope, categoryKey } = budgetKey(input.categoryId, input.savings);
  return withRetry(() =>
    prisma.$transaction(async (tx) => {
      // Edits are rare, so serialize them all on the Household row. This makes
      // "read the prior amount, then write" safe when two edits race.
      const lock = await tx.$queryRaw<{ id: number }[]>(
        Prisma.sql`SELECT id FROM Household WHERE id = ${HOUSEHOLD_ID} FOR UPDATE`,
      );
      if (lock.length === 0) throw new Error("Household row missing. Run the seed.");
      const before = await budgetFor(tx, input.categoryId, input.period, input.savings);
      await tx.monthlyBudget.upsert({
        where: { categoryKey_effectiveFrom: { categoryKey, effectiveFrom: input.period } },
        update: { amount: input.amount, updatedById: input.actorId },
        create: {
          scope,
          categoryId: input.categoryId,
          categoryKey,
          effectiveFrom: input.period,
          amount: input.amount,
          updatedById: input.actorId,
        },
      });
      if (input.mode === "this_period_only" && before) {
        // skipDuplicates: if P+1 already has a row, it already defines P+1. Leave it.
        await tx.monthlyBudget.createMany({
          data: [
            {
              scope,
              categoryId: input.categoryId,
              categoryKey,
              effectiveFrom: nextPeriod(input.period),
              amount: before.amount,
              updatedById: input.actorId,
            },
          ],
          skipDuplicates: true,
        });
      }
    }),
  );
}
