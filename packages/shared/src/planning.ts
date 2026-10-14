import { z } from "zod";
import { Scope, dateOnlySchema, moneySchema } from "./base.js";
import { periodKeySchema, positiveMoneySchema } from "./transactions.js";

/**
 * Phase 4 contract: dashboard, budgets, allowances, bills (recurring and installments).
 * All routes are under /api, need a session, and the ones that change data need X-CSRF-Token.
 * Errors use ApiError. Every `month` is a period key "YYYY-MM".
 *
 * Dashboard (read only; Appendix A formulas, computed on the server in integer cents).
 *   GET  /dashboard?month=            -> 200 Dashboard
 *        Also generates missing planned occurrences for the next months (idempotent).
 *
 * Budgets (versioned; past periods are never changed).
 *   GET  /budgets?month=              -> 200 BudgetOverview
 *   PUT  /budgets                     -> 200 BudgetOverview   body BudgetEdit
 *
 * Allowances (append-only ledger; one ALLOCATION per person and month).
 *   GET  /allowances?month=           -> 200 AllowanceOverview
 *   POST /allowances                  -> 201 AllowanceOverview   body AllowanceCreate
 *        Second ALLOCATION for the same person and month -> 409 allocation_exists.
 *
 * Bills (planned items; "A pagar").
 *   GET  /bills?month=                -> 200 BillList   (due in that month, every status)
 *   POST /recurrence-rules            -> 201 BillList   body RecurrenceRuleCreate (generates occurrences)
 *   GET  /recurrence-rules            -> 200 RecurrenceRuleList
 *   PATCH /recurrence-rules/:id       -> 200 RecurrenceRule     body RecurrenceRulePatch
 *   POST /installment-plans           -> 201 InstallmentPlanDetail   body InstallmentPlanCreate
 *   POST /bills/:kind/:id/confirm     -> 200 Bill   body BillConfirm (kind = recurrence | installment)
 *        Creates ONE confirmed Transaction (type expense, linked to the occurrence) and
 *        marks the occurrence confirmed, in one transaction. Already confirmed -> 409 invalid_state.
 *        Two parallel confirms -> one wins, the other gets 409. Never auto-confirmed by date.
 *   POST /bills/:kind/:id/cancel      -> 200 Bill   body ReasonRequest (planned -> cancelled)
 *
 * Rules:
 *  - `expectedAmount` null means "unknown" (UI shows `valor ?`). It is not 0. Totals skip nulls
 *    and report how many were skipped (`unknownCount`).
 *  - Planned items are never counted as actual spending. Only confirmed transactions count.
 *  - Budget "spent" = confirmed household expenses in the month minus their linked confirmed
 *    refunds, per category (overall = all household expenses). Personal spending is not budgeted.
 *  - Savings rate = savings before goals / household income, as a percent string "12.5",
 *    or null when income is 0.
 *  - Goals are not in P0, so goal allocations are 0 and unallocated savings = savings.
 */

export const dashboardQuerySchema = z.object({ month: periodKeySchema });
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

export const personSummarySchema = z.object({
  userId: z.number().int(),
  allowanceAllocated: moneySchema, // ALLOCATION + ADJUSTMENT + CORRECTION rows of the month
  personalSpent: moneySchema, // confirmed personal expenses (net of refunds)
  personalCredits: moneySchema, // confirmed personal income and other_receipt
  /** Opening balance + month movements. Unused allowance is never reset. */
  closingBalance: moneySchema,
});
export type PersonSummary = z.infer<typeof personSummarySchema>;

export const dashboardSchema = z.object({
  month: periodKeySchema,
  householdIncome: moneySchema,
  sharedExpensesNet: moneySchema,
  allowanceAllocations: moneySchema,
  savingsBeforeGoals: moneySchema,
  goalAllocationsNet: moneySchema,
  unallocatedSavings: moneySchema,
  savingsRate: z.string().nullable(),
  /** Planned, not yet confirmed, with a known amount. */
  plannedBillsTotal: moneySchema,
  plannedBillsUnknownCount: z.number().int(),
  overallBudget: z.object({ budget: moneySchema.nullable(), spent: moneySchema }),
  people: z.array(personSummarySchema),
});
export type Dashboard = z.infer<typeof dashboardSchema>;

export const budgetLineSchema = z.object({
  /** null = the overall household budget */
  categoryId: z.number().int().nullable(),
  /** Amount in force for the month; null when no budget was ever set. */
  amount: moneySchema.nullable(),
  spent: moneySchema,
});
export type BudgetLine = z.infer<typeof budgetLineSchema>;

export const budgetOverviewSchema = z.object({
  month: periodKeySchema,
  overall: budgetLineSchema,
  categories: z.array(budgetLineSchema),
});
export type BudgetOverview = z.infer<typeof budgetOverviewSchema>;

export const BudgetEditMode = z.enum(["going_forward", "this_period_only"]);
export type BudgetEditMode = z.infer<typeof BudgetEditMode>;

export const budgetEditSchema = z.object({
  categoryId: z.number().int().positive().nullable(),
  period: periodKeySchema,
  amount: moneySchema.refine((s) => Number(s) >= 0, "Must not be negative"),
  mode: BudgetEditMode,
});
export type BudgetEdit = z.infer<typeof budgetEditSchema>;

export const allowanceKindSchema = z.enum(["ALLOCATION", "ADJUSTMENT", "CORRECTION"]);

export const allowanceCreateSchema = z.object({
  ownerId: z.number().int().positive(),
  month: periodKeySchema,
  amount: positiveMoneySchema,
  notes: z.string().trim().max(500).optional(),
});
export type AllowanceCreate = z.infer<typeof allowanceCreateSchema>;

export const allowanceOverviewSchema = z.object({
  month: periodKeySchema,
  people: z.array(
    z.object({
      ownerId: z.number().int(),
      allocation: moneySchema.nullable(), // null = not yet allocated this month
      closingBalance: moneySchema,
    }),
  ),
});
export type AllowanceOverview = z.infer<typeof allowanceOverviewSchema>;

export const BillKind = z.enum(["recurrence", "installment"]);
export type BillKind = z.infer<typeof BillKind>;

export const OccurrenceStatus = z.enum(["planned", "confirmed", "cancelled"]);
export type OccurrenceStatus = z.infer<typeof OccurrenceStatus>;

export const billSchema = z.object({
  kind: BillKind,
  /** Id of the RecurrenceOccurrence or InstallmentOccurrence. */
  id: z.number().int(),
  parentId: z.number().int(), // rule id or plan id
  description: z.string(),
  dueDate: dateOnlySchema,
  expectedAmount: moneySchema.nullable(),
  status: OccurrenceStatus,
  scope: Scope,
  ownerId: z.number().int().nullable(),
  payerId: z.number().int().nullable(),
  categoryId: z.number().int().nullable(),
  accountId: z.number().int().nullable(),
  paymentMethodId: z.number().int().nullable(),
  /** "3/10" for installments. */
  sequenceNumber: z.number().int().nullable(),
  installmentCount: z.number().int().nullable(),
  /** Set after confirm. */
  transactionId: z.number().int().nullable(),
});
export type Bill = z.infer<typeof billSchema>;

export const billListSchema = z.object({
  month: periodKeySchema,
  items: z.array(billSchema),
  plannedTotal: moneySchema,
  unknownCount: z.number().int(),
});
export type BillList = z.infer<typeof billListSchema>;

const idSchema = z.number().int().positive();
const descriptionSchema = z.string().trim().min(1).max(200);

const scopeOwnerCheck = (
  v: { scope: Scope; ownerId?: number | null },
  ctx: z.RefinementCtx,
) => {
  if (v.scope === "personal" && v.ownerId == null)
    ctx.addIssue({ code: "custom", path: ["ownerId"], message: "Owner required" });
  if (v.scope === "household" && v.ownerId != null)
    ctx.addIssue({ code: "custom", path: ["ownerId"], message: "Household has no owner" });
};

export const RecurrenceState = z.enum(["active", "paused", "ended"]);
export type RecurrenceState = z.infer<typeof RecurrenceState>;

export const recurrenceRuleCreateSchema = z
  .object({
    description: descriptionSchema,
    /** null = amount not known yet. */
    expectedAmount: positiveMoneySchema.nullable(),
    dayOfMonth: z.number().int().min(1).max(31),
    startDate: dateOnlySchema,
    endDate: dateOnlySchema.nullable().optional(),
    scope: Scope,
    ownerId: idSchema.nullable().optional(),
    payerId: idSchema.optional(),
    categoryId: idSchema,
    accountId: idSchema.nullable().optional(),
    paymentMethodId: idSchema.nullable().optional(),
  })
  .superRefine(scopeOwnerCheck)
  .refine((v) => v.endDate == null || v.endDate >= v.startDate, {
    path: ["endDate"],
    message: "End before start",
  });
export type RecurrenceRuleCreate = z.infer<typeof recurrenceRuleCreateSchema>;

export const recurrenceRulePatchSchema = z
  .object({
    description: descriptionSchema,
    expectedAmount: positiveMoneySchema.nullable(),
    endDate: dateOnlySchema.nullable(),
    state: RecurrenceState,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Empty patch");
export type RecurrenceRulePatch = z.infer<typeof recurrenceRulePatchSchema>;

export const recurrenceRuleSchema = z.object({
  id: z.number().int(),
  description: z.string(),
  expectedAmount: moneySchema.nullable(),
  dayOfMonth: z.number().int(),
  startDate: dateOnlySchema,
  endDate: dateOnlySchema.nullable(),
  state: RecurrenceState,
  scope: Scope,
  ownerId: z.number().int().nullable(),
  payerId: z.number().int().nullable(),
  categoryId: z.number().int().nullable(),
  accountId: z.number().int().nullable(),
  paymentMethodId: z.number().int().nullable(),
});
export type RecurrenceRule = z.infer<typeof recurrenceRuleSchema>;
export const recurrenceRuleListSchema = z.object({ items: z.array(recurrenceRuleSchema) });
export type RecurrenceRuleList = z.infer<typeof recurrenceRuleListSchema>;

export const installmentPlanCreateSchema = z
  .object({
    description: descriptionSchema,
    totalAmount: positiveMoneySchema,
    installmentCount: z.number().int().min(2).max(60),
    firstDueDate: dateOnlySchema,
    scope: Scope,
    ownerId: idSchema.nullable().optional(),
    payerId: idSchema.optional(),
    categoryId: idSchema,
    accountId: idSchema.nullable().optional(),
    notes: z.string().trim().max(500).nullable().optional(),
  })
  .superRefine(scopeOwnerCheck);
export type InstallmentPlanCreate = z.infer<typeof installmentPlanCreateSchema>;

export const installmentPlanDetailSchema = z.object({
  id: z.number().int(),
  description: z.string(),
  totalAmount: moneySchema,
  installmentCount: z.number().int(),
  firstDueDate: dateOnlySchema,
  items: z.array(billSchema),
});
export type InstallmentPlanDetail = z.infer<typeof installmentPlanDetailSchema>;

/**
 * Body of "Confirmar pagamento". All fields are optional: the server pre-fills from the
 * occurrence. `amount` is required when the expected amount is unknown (null).
 */
export const billConfirmSchema = z.object({
  amount: positiveMoneySchema.optional(),
  transactionDate: dateOnlySchema.optional(),
  payerId: idSchema.optional(),
  accountId: idSchema.nullable().optional(),
  paymentMethodId: idSchema.nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});
export type BillConfirm = z.infer<typeof billConfirmSchema>;
