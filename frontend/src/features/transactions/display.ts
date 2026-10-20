import { TonePalette, type Transaction } from "@spendual/shared";
import { formatMoney, fromCents, toCents, type AmountSign } from "../../lib/currency";

/** How an amount reads for each type (ui-guidelines §5). */
export function amountSignFor(tx: Pick<Transaction, "type">): AmountSign {
  switch (tx.type) {
    case "expense":
      return "minus";
    case "income":
    case "other_receipt":
    case "refund":
      return "plus";
    case "transfer":
      return "none";
  }
}

export function formatTxAmount(tx: Pick<Transaction, "type" | "amount">): string {
  return formatMoney(tx.amount, amountSignFor(tx));
}

/** Signed cents that count in a day total. Transfers and voided or cancelled rows count zero. */
function countedCents(tx: Transaction): bigint {
  if (tx.status !== "confirmed" && tx.status !== "planned") return 0n;
  const cents = toCents(tx.amount);
  if (tx.type === "expense") return -cents;
  if (tx.type === "transfer") return 0n;
  return cents;
}

/** Exact decimal sum (BigInt cents). The API sends no day totals. */
export function dayTotal(items: Transaction[]): string {
  return fromCents(items.reduce((sum, tx) => sum + countedCents(tx), 0n));
}

/** Confirmed expenses minus confirmed refunds, as the dashboard counts category spending. */
export function netSpent(items: Transaction[]): string {
  let cents = 0n;
  for (const tx of items) {
    if (tx.status !== "confirmed") continue;
    if (tx.type === "expense") cents += toCents(tx.amount);
    else if (tx.type === "refund") cents -= toCents(tx.amount);
  }
  return fromCents(cents);
}

export function groupByDay(items: Transaction[]): { date: string; items: Transaction[] }[] {
  const groups = new Map<string, Transaction[]>();
  for (const tx of items) {
    const list = groups.get(tx.transactionDate);
    if (list) list.push(tx);
    else groups.set(tx.transactionDate, [tx]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([date, list]) => ({ date, items: list }));
}

/** CSS color for a user tone key (TonePalette). Unknown or empty falls back to the neutral line color. */
export function toneColor(key: string | null | undefined): string {
  const tone = TonePalette.safeParse(key);
  return tone.success ? `var(--tone-${tone.data})` : "var(--line)";
}
