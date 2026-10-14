import type { Prisma, PrismaClient } from "@prisma/client";
import { withRetry } from "../lib/withRetry.js";
import { addPeriods, dateOnlyToDate, dateToDateOnly, resolveDueDate } from "../lib/period.js";

/** Generation horizon: the current month plus the next three. */
export const GENERATION_MONTHS = 4;

/**
 * Create planned occurrences for a rule from `fromPeriod` for GENERATION_MONTHS months.
 * Safe to run twice or in parallel: createMany skipDuplicates (INSERT IGNORE) plus the
 * unique (ruleId, periodKey) key. Returns how many rows were new.
 */
export async function generateOccurrences(
  prisma: PrismaClient,
  ruleId: number,
  fromPeriod: string,
  months = GENERATION_MONTHS,
): Promise<number> {
  const rule = await prisma.recurrenceRule.findUniqueOrThrow({ where: { id: ruleId } });
  if (rule.state !== "active") return 0;
  const startPeriod = dateToDateOnly(rule.startDate).slice(0, 7);
  const endPeriod = rule.endDate ? dateToDateOnly(rule.endDate).slice(0, 7) : null;
  const data: Prisma.RecurrenceOccurrenceCreateManyInput[] = [];
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
  if (data.length === 0) return 0;
  // One INSERT IGNORE statement. Retry if parallel runs deadlock on the unique key.
  const res = await withRetry(() =>
    prisma.recurrenceOccurrence.createMany({ data, skipDuplicates: true }),
  );
  return res.count;
}
