import { z } from "zod";
import { Scope, TransactionStatus, TransactionType, dateOnlySchema, moneySchema } from "./base.js";

/**
 * Phase 3 contract: catalogs and transactions. All routes are under /api, need a session,
 * and the ones that change data need X-CSRF-Token. Errors use ApiError (400, 401, 403, 404, 409).
 *
 * Catalogs (categories, accounts, payment methods). Archive, never delete.
 *   GET   /lookups                 -> 200 Lookups   (users + active and archived catalogs)
 *   POST  /categories              -> 201 Category        body CategoryInput
 *   PATCH /categories/:id          -> 200 Category        body CategoryPatch
 *   POST  /accounts                -> 201 Account         body AccountInput
 *   PATCH /accounts/:id            -> 200 Account         body AccountPatch
 *   POST  /payment-methods         -> 201 PaymentMethod   body PaymentMethodInput
 *   PATCH /payment-methods/:id     -> 200 PaymentMethod   body PaymentMethodPatch
 *   Duplicate name -> 409 name_taken.
 *
 * Transactions.
 *   GET   /transactions            -> 200 TransactionList   query TransactionListQuery
 *   GET   /transactions/:id        -> 200 Transaction | 404
 *   POST  /transactions            -> 201 Transaction       body TransactionCreate
 *   PATCH /transactions/:id        -> 200 Transaction       body TransactionPatch (status confirmed)
 *   POST  /transactions/:id/void   -> 200 Transaction       body ReasonRequest (confirmed -> voided)
 *   POST  /transactions/:id/cancel -> 200 Transaction       body ReasonRequest (planned -> cancelled)
 *   GET   /transactions/:id/audit  -> 200 AuditEventList
 *
 * Rules:
 *  - `amount` is always positive. The type gives the meaning:
 *    expense = out, income and other_receipt = in, refund = reduces the linked expense,
 *    transfer = neutral (not income, not expense).
 *  - POST always creates status "confirmed". Planned rows come from Phase 4.
 *  - scope "personal" needs `ownerId`. scope "household" must send `ownerId` null.
 *  - `payerId` defaults to the signed-in user. `ownerId` and `payerId` must be active users.
 *  - expense: `categoryId` required. income and other_receipt: category optional.
 *    refund: `relatedTransactionId` required (a confirmed expense); sum of its confirmed
 *    refunds may not pass its amount (409 refund_exceeds). transfer: `accountId` required,
 *    no category, no related transaction.
 *  - Archived catalog items cannot be used in new records (400 validation_error).
 *  - PATCH changes only: amount, description, transactionDate, categoryId, accountId,
 *    paymentMethodId, payerId, notes. Type, scope, owner and link never change; void and
 *    re-enter instead. Every PATCH, void and cancel writes one AuditEvent (before, after, reason).
 *  - void and cancel need a non-empty `reason` (400 if missing). No hard delete.
 *  - A void or cancel on the wrong status -> 409 invalid_state.
 *  - Voiding an expense that has confirmed refunds -> 409 has_refunds.
 *  - GET list: `month` (YYYY-MM) filters by transactionDate; other filters are optional.
 *    Newest first. Planned rows are never in this list (Lançamentos shows actuals only).
 */

export const categorySchema = z.object({
  id: z.number().int(),
  name: z.string(),
  active: z.boolean(),
});
export type Category = z.infer<typeof categorySchema>;

export const AccountType = z.enum(["bank", "cash", "credit_card", "other"]);
export type AccountType = z.infer<typeof AccountType>;

export const accountSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  type: AccountType,
  active: z.boolean(),
});
export type Account = z.infer<typeof accountSchema>;

export const paymentMethodSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  active: z.boolean(),
});
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

const nameSchema = z.string().trim().min(1).max(80);

export const categoryInputSchema = z.object({ name: nameSchema });
export type CategoryInput = z.infer<typeof categoryInputSchema>;
export const categoryPatchSchema = z
  .object({ name: nameSchema, active: z.boolean() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Empty patch");
export type CategoryPatch = z.infer<typeof categoryPatchSchema>;

export const accountInputSchema = z.object({ name: nameSchema, type: AccountType });
export type AccountInput = z.infer<typeof accountInputSchema>;
export const accountPatchSchema = z
  .object({ name: nameSchema, type: AccountType, active: z.boolean() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Empty patch");
export type AccountPatch = z.infer<typeof accountPatchSchema>;

export const paymentMethodInputSchema = z.object({ name: nameSchema });
export type PaymentMethodInput = z.infer<typeof paymentMethodInputSchema>;
export const paymentMethodPatchSchema = categoryPatchSchema;
export type PaymentMethodPatch = z.infer<typeof paymentMethodPatchSchema>;

export const lookupUserSchema = z.object({
  id: z.number().int(),
  displayName: z.string(),
  tonePalette: z.string().nullable(),
});
export type LookupUser = z.infer<typeof lookupUserSchema>;

export const lookupsSchema = z.object({
  users: z.array(lookupUserSchema),
  categories: z.array(categorySchema),
  accounts: z.array(accountSchema),
  paymentMethods: z.array(paymentMethodSchema),
});
export type Lookups = z.infer<typeof lookupsSchema>;

const idSchema = z.number().int().positive();
const descriptionSchema = z.string().trim().min(1).max(200);
const notesSchema = z.string().trim().max(500);

/** Money that must be above zero, for example "12.50". */
export const positiveMoneySchema = moneySchema.refine((s) => Number(s) > 0, "Must be above zero");

export const transactionCreateSchema = z
  .object({
    type: TransactionType,
    amount: positiveMoneySchema,
    description: descriptionSchema,
    transactionDate: dateOnlySchema,
    scope: Scope,
    ownerId: idSchema.nullable().optional(),
    payerId: idSchema.optional(),
    categoryId: idSchema.nullable().optional(),
    accountId: idSchema.nullable().optional(),
    paymentMethodId: idSchema.nullable().optional(),
    relatedTransactionId: idSchema.nullable().optional(),
    notes: notesSchema.nullable().optional(),
  })
  .superRefine((v, ctx) => {
    const bad = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });
    if (v.scope === "personal" && v.ownerId == null) bad("ownerId", "Owner required");
    if (v.scope === "household" && v.ownerId != null) bad("ownerId", "Household has no owner");
    if (v.type === "expense" && v.categoryId == null) bad("categoryId", "Category required");
    if (v.type === "refund" && v.relatedTransactionId == null)
      bad("relatedTransactionId", "Linked expense required");
    if (v.type === "transfer") {
      if (v.accountId == null) bad("accountId", "Account required");
      if (v.categoryId != null) bad("categoryId", "Transfer has no category");
    }
    if (v.type !== "refund" && v.relatedTransactionId != null)
      bad("relatedTransactionId", "Only refunds link to a record");
  });
export type TransactionCreate = z.infer<typeof transactionCreateSchema>;

export const transactionPatchSchema = z
  .object({
    amount: positiveMoneySchema,
    description: descriptionSchema,
    transactionDate: dateOnlySchema,
    categoryId: idSchema.nullable(),
    accountId: idSchema.nullable(),
    paymentMethodId: idSchema.nullable(),
    payerId: idSchema,
    notes: notesSchema.nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Empty patch");
export type TransactionPatch = z.infer<typeof transactionPatchSchema>;

export const reasonRequestSchema = z.object({ reason: z.string().trim().min(1).max(500) });
export type ReasonRequest = z.infer<typeof reasonRequestSchema>;

export const periodKeySchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Invalid period");

export const transactionListQuerySchema = z.object({
  month: periodKeySchema,
  scope: Scope.optional(),
  /** Records where this user is owner (personal) or payer (household). */
  personId: z.coerce.number().int().positive().optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  type: TransactionType.optional(),
  status: TransactionStatus.optional(),
});
export type TransactionListQuery = z.infer<typeof transactionListQuerySchema>;

export const transactionSchema = z.object({
  id: z.number().int(),
  type: TransactionType,
  status: TransactionStatus,
  amount: moneySchema,
  currency: z.string(),
  description: z.string(),
  transactionDate: dateOnlySchema,
  scope: Scope,
  ownerId: z.number().int().nullable(),
  payerId: z.number().int().nullable(),
  categoryId: z.number().int().nullable(),
  accountId: z.number().int().nullable(),
  paymentMethodId: z.number().int().nullable(),
  relatedTransactionId: z.number().int().nullable(),
  notes: z.string().nullable(),
  voidReason: z.string().nullable(),
  createdById: z.number().int(),
  updatedById: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Transaction = z.infer<typeof transactionSchema>;

export const transactionListSchema = z.object({ items: z.array(transactionSchema) });
export type TransactionList = z.infer<typeof transactionListSchema>;

export const auditEventSchema = z.object({
  id: z.number().int(),
  actorId: z.number().int(),
  action: z.string(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  reason: z.string().nullable(),
  createdAt: z.string(),
});
export type AuditEventDto = z.infer<typeof auditEventSchema>;
export const auditEventListSchema = z.object({ items: z.array(auditEventSchema) });
export type AuditEventList = z.infer<typeof auditEventListSchema>;
