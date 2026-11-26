import { z } from "zod";
import { dateOnlySchema } from "./base.js";

/**
 * P1 contract: CSV export. Read only, needs a session, no CSRF token (GET).
 *
 *   GET /export/transactions.csv?from=&to=  -> 200 text/csv (UTF-8 with BOM, attachment)
 *
 *  - `from` and `to` are optional dates (inclusive) on the transaction date. Both missing = all.
 *  - `from` after `to` -> 400 validation_error.
 *  - One row per transaction, every type and status (planned, voided and cancelled included).
 *  - Header and columns are fixed: id, date, type, status, amount, description, scope, owner,
 *    payer, category, account, payment_method, related_id, notes, void_reason.
 *  - Amounts use a dot and 2 places ("1250.50"). Dates are YYYY-MM-DD. Names, not ids.
 *  - A text cell that starts with = + - @ gets a leading apostrophe (spreadsheet formulas).
 */
export const exportQuerySchema = z
  .object({ from: dateOnlySchema.optional(), to: dateOnlySchema.optional() })
  .refine((q) => !q.from || !q.to || q.from <= q.to, {
    path: ["from"],
    message: "Must not be after to",
  });
export type ExportQuery = z.infer<typeof exportQuerySchema>;

export const TRANSACTION_CSV_COLUMNS = [
  "id",
  "date",
  "type",
  "status",
  "amount",
  "description",
  "scope",
  "owner",
  "payer",
  "category",
  "account",
  "payment_method",
  "related_id",
  "notes",
  "void_reason",
] as const;
