import type { Prisma, PrismaClient, RecurrenceRule } from "@prisma/client";
import { withRetry } from "../lib/withRetry.js";
import { addPeriods, dateOnlyToDate, dateToDateOnly, resolveDueDate } from "../lib/period.js";

/** Generation horizon: the current month plus the next three. */
export const GENERATION_MONTHS = 4;

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Insert planned occurrences for the given rows from `fromPeriod` for `months` months.
 * Uses the rows as given (no re-read), so the caller decides how fresh they are.
 * One INSERT IGNORE: safe to run twice, thanks to the unique (ruleId, periodKey) key.
 */
export async function generateForRules(
  db: Db,
  rules: RecurrenceRule[],
  fromPeriod: string,
  months = GENERATION_MONTHS,
): Promise<number> {
  const data: Prisma.RecurrenceOccurrenceCreateManyInput[] = [];
  for (const rule of rules) {
    if (rule.state !== "active") continue;
    const startPeriod = dateToDateOnly(rule.startDate).slice(0, 7);
    const endPeriod = rule.endDate ? dateToDateOnly(rule.endDate).slice(0, 7) : null;
    for (let i = 0; i < months; i++) {
      const periodKey = addPeriods(fromPeriod, i);
      if (periodKey < startPeriod || (endPeriod !== null && periodKey > endPeriod)) continue;
      data.push({
        ruleId: rule.id,
        periodKey,
        dueDate: dateOnlyToDate(resolveDueDate(periodKey, rule.dayOfMonth)),
        expectedAmount: rule.expectedAmount, // null stays null, it is not 0
      });
    }
  }
  if (data.length === 0) return 0;
  const res = await db.recurrenceOccurrence.createMany({ data, skipDuplicates: true });
  return res.count;
}

/**
 * Create planned occurrences for one rule. Returns how many rows were new.
 * Retries if parallel runs deadlock on the unique key.
 */
export async function generateOccurrences(
  prisma: PrismaClient,
  ruleId: number,
  fromPeriod: string,
  months = GENERATION_MONTHS,
): Promise<number> {
  const rule = await prisma.recurrenceRule.findUniqueOrThrow({ where: { id: ruleId } });
  return withRetry(() => generateForRules(prisma, [rule], fromPeriod, months));
}
