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

const MAX_AMOUNT_DIGITS = 12;

const DOT_DECIMAL = /^(\d+(?:\.\d{3})*)\.(\d{1,2})$/;

/**
 * Parse pasted text. Like parseAmountInput, but a last dot followed by 1 or 2 digits is a
 * decimal point ("12.5" = 12,50). A dot followed by exactly 3 digits is a thousands group.
 */
export function parsePastedAmount(input: string): Money | null {
  const text = input.replace(/\s/g, "").replace(/^R\$/, "");
  const match = DOT_DECIMAL.exec(text);
  if (match && !text.includes(",")) {
    return parseAmountInput(`${(match[1] as string).replaceAll(".", "")},${match[2] as string}`);
  }
  return parseAmountInput(text);
}

function groupThousands(int: string): string {
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** API money ("1234.50") to the text shown in an amount field ("1.234,50"). */
export function formatAmountInput(amount: Money): string {
  const match = MONEY.exec(amount);
  if (!match || match[1]) return "";
  const int = (match[2] as string).replace(/^0+(?=\d)/, "");
  if (int === "0" && match[3] === "00") return "";
  return `${groupThousands(int)},${match[3] as string}`;
}

/**
 * Live mask for an amount field: digits fill from the right ("123456" -> "1.234,56").
 * Any non-digit is dropped, so backspace over a separator still works. Zero gives "".
 */
export function maskAmountInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").replace(/^0+/, "").slice(0, MAX_AMOUNT_DIGITS);
  if (digits === "") return "";
  const padded = digits.padStart(3, "0");
  return `${groupThousands(padded.slice(0, -2))},${padded.slice(-2)}`;
}
