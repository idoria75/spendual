import type { Money } from "@spendual/shared";

/** The one BRL formatter of the app (ui-guidelines §5). */
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const MINUS = "−";
const MONEY = /^(-?)(\d{1,10})\.(\d{2})$/;

export type AmountSign = "minus" | "plus" | "none";

/** Format an API money string ("1234.50") without turning it into a float. */
export function formatMoney(amount: Money, sign: AmountSign = "none"): string {
  const match = MONEY.exec(amount);
  if (!match) return amount;
  const [, neg, int, cents] = match as unknown as [string, string, string, string];
  const parts = brl
    .formatToParts(BigInt(int))
    .map((p) => (p.type === "fraction" ? cents : p.value));
  const body = parts.join("");
  if (sign === "plus") return `+${body}`;
  if (sign === "minus") return `${MINUS}${body}`;
  return neg ? `${MINUS}${body}` : body;
}

/** Money string to integer cents (BigInt, exact). */
export function toCents(amount: Money): bigint {
  const match = MONEY.exec(amount);
  if (!match) return 0n;
  const value = BigInt(match[2] as string) * 100n + BigInt(match[3] as string);
  return match[1] ? -value : value;
}

/** Integer cents back to a money string. */
export function fromCents(cents: bigint): Money {
  const neg = cents < 0n;
  const abs = neg ? -cents : cents;
  const int = abs / 100n;
  const frac = (abs % 100n).toString().padStart(2, "0");
  return `${neg ? "-" : ""}${int.toString()}.${frac}`;
}

/**
 * Parse PT-BR typed input ("1.234,56", "0,5", "1234") to the API string ("1234.56").
 * Returns null when the text is not a valid amount. No float math.
 */
export function parseAmountInput(input: string): Money | null {
  const text = input.replace(/\s/g, "").replace(/^R\$/, "");
  if (text === "") return null;
  const [intRaw = "", fracRaw = "", ...rest] = text.split(",");
  if (rest.length > 0) return null;
  const hasComma = text.includes(",");
  if (hasComma && fracRaw.length > 2) return null;
  if (hasComma && !/^\d*$/.test(fracRaw)) return null;
  if (!hasComma && intRaw.includes(".") === false && !/^\d+$/.test(intRaw)) return null;
  let digits: string;
  if (/^\d*$/.test(intRaw)) digits = intRaw;
  else if (/^\d{1,3}(\.\d{3})+$/.test(intRaw)) digits = intRaw.replaceAll(".", "");
  else return null;
  if (digits === "" && fracRaw === "") return null;
  const int = digits.replace(/^0+(?=\d)/, "") || "0";
  if (int.length > 10) return null;
  return `${int}.${fracRaw.padEnd(2, "0")}`;
}
