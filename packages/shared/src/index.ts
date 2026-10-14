import { z } from "zod";

/** Decimal string with two places, for example "-12.50". Never a JS number. */
export type Money = string;
export const moneySchema = z.string().regex(/^-?\d{1,10}\.\d{2}$/, "Invalid money");

/** Calendar date "YYYY-MM-DD", no time zone. */
export type DateOnly = string;
export const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date")
  .refine((s) => {
    const [y, m, d] = s.split("-").map(Number) as [number, number, number];
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }, "Invalid date");

export const TransactionType = z.enum(["expense", "income", "other_receipt", "refund", "transfer"]);
export type TransactionType = z.infer<typeof TransactionType>;

export const TransactionStatus = z.enum(["planned", "confirmed", "cancelled", "voided"]);
export type TransactionStatus = z.infer<typeof TransactionStatus>;

export const Scope = z.enum(["household", "personal"]);
export type Scope = z.infer<typeof Scope>;
