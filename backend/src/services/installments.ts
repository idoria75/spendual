import { addPeriods, resolveDueDate } from "../lib/period.js";

/** Money string "123.45" to integer cents. No floats. */
export function moneyToCents(money: string): bigint {
  const m = /^(-?)(\d{1,10})\.(\d{2})$/.exec(money);
  if (!m) throw new Error(`Invalid money: ${money}`);
  const cents = BigInt(m[2]) * 100n + BigInt(m[3]);
  return m[1] ? -cents : cents;
}

export function centsToMoney(cents: bigint): string {
  const neg = cents < 0n;
  const abs = neg ? -cents : cents;
  const s = `${abs / 100n}.${String(abs % 100n).padStart(2, "0")}`;
  return neg ? `-${s}` : s;
}

/**
 * Split a total into `count` installments in integer cents.
 * Each gets floor(total / count). The remainder goes to the last one.
 */
export function splitInstallments(total: string, count: number): string[] {
  if (!Number.isInteger(count) || count < 1) throw new Error(`Invalid count: ${count}`);
  const cents = moneyToCents(total);
  if (cents < 0n) throw new Error("Total must not be negative");
  const n = BigInt(count);
  const base = cents / n;
  const remainder = cents - base * n;
  const out: string[] = [];
  for (let i = 1; i <= count; i++) {
    out.push(centsToMoney(i === count ? base + remainder : base));
  }
  return out;
}

export interface InstallmentRow {
  sequenceNumber: number;
  dueDate: string;
  expectedAmount: string;
}

/** Build the rows for a plan. Due day follows the first due date, clamped in short months. */
export function buildInstallmentRows(
  total: string,
  count: number,
  firstDueDate: string,
): InstallmentRow[] {
  const amounts = splitInstallments(total, count);
  const startPeriod = firstDueDate.slice(0, 7);
  const day = Number(firstDueDate.slice(8, 10));
  return amounts.map((expectedAmount, i) => ({
    sequenceNumber: i + 1,
    dueDate: resolveDueDate(addPeriods(startPeriod, i), day),
    expectedAmount,
  }));
}
