import { centsToMoney, moneyToCents } from "../services/installments.js";

/**
 * Appendix A of the finance guide, in integer cents. Pure: no DB, no floats.
 * Callers pass already-filtered sums (confirmed rows only, planned rows never).
 */

export const sumCents = (values: readonly bigint[]): bigint => values.reduce((a, b) => a + b, 0n);

/** Expenses minus the confirmed refunds linked to them. */
export const netExpenses = (expenses: bigint, linkedRefunds: bigint): bigint =>
  expenses - linkedRefunds;

export interface SavingsInput {
  householdIncome: bigint;
  sharedExpensesNet: bigint;
  allowanceAllocations: bigint;
}

export const savingsBeforeGoals = (i: SavingsInput): bigint =>
  i.householdIncome - i.sharedExpensesNet - i.allowanceAllocations;

export const unallocatedSavings = (savings: bigint, goalAllocationsNet: bigint): bigint =>
  savings - goalAllocationsNet;

/**
 * Savings before goals as a percent of income with one decimal ("12.5").
 * Rounds half away from zero. null when income is not above zero.
 */
export function savingsRate(savings: bigint, income: bigint): string | null {
  if (income <= 0n) return null;
  const num = savings * 1000n;
  let tenths = num / income;
  const rem = num % income;
  const twice = (rem < 0n ? -rem : rem) * 2n;
  if (twice >= income) tenths += num < 0n ? -1n : 1n;
  const neg = tenths < 0n;
  const abs = neg ? -tenths : tenths;
  return `${neg ? "-" : ""}${abs / 10n}.${abs % 10n}`;
}

export interface PersonalInput {
  opening: bigint;
  allowanceAllocations: bigint;
  personalCredits: bigint;
  personalExpensesNet: bigint;
  transfersOut?: bigint;
}

/** Unused allowance is never reset: the opening balance carries over. */
export const personalClosingBalance = (i: PersonalInput): bigint =>
  i.opening +
  i.allowanceAllocations +
  i.personalCredits -
  i.personalExpensesNet -
  (i.transfersOut ?? 0n);

export { centsToMoney, moneyToCents };
