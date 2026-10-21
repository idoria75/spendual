import { z } from "zod";
import { dateOnlySchema, moneySchema } from "./base.js";
import { positiveMoneySchema } from "./transactions.js";

/**
 * P1 contract: shared savings goals (page "Metas").
 * All routes are under /api, need a session, and the ones that change data need X-CSRF-Token.
 * Errors use ApiError.
 *
 *   GET   /goals                   -> 200 GoalList         (every status, newest first)
 *   POST  /goals                   -> 201 Goal             body GoalCreate
 *   PATCH /goals/:id               -> 200 Goal             body GoalPatch (active or completed)
 *   POST  /goals/:id/allocations   -> 201 Goal             body GoalMove (active only)
 *   POST  /goals/:id/withdrawals   -> 201 Goal             body GoalMove (active only)
 *   POST  /goals/:id/complete      -> 200 Goal             (active -> completed)
 *   POST  /goals/:id/reopen        -> 200 Goal             (completed -> active)
 *   POST  /goals/:id/archive       -> 200 Goal             (active or completed -> archived)
 *   GET   /goals/:id/entries       -> 200 GoalEntryList    (newest first)
 *
 * Rules (guide section 7):
 *  - `balance` = ALLOCATION - WITHDRAWAL +/- CORRECTION, derived on read, never stored.
 *  - Allocation and withdrawal are not income and not expense.
 *  - A withdrawal goes back to unallocated savings only. Over the balance -> 409 insufficient_balance.
 *  - An allocation above the unallocated savings of the entry month -> 409 insufficient_savings.
 *  - A write on a goal in the wrong status -> 409 invalid_state. `archived` is final and read only.
 *  - complete and archive need a zero balance, else 409 goal_has_balance.
 *  - `effectiveDate` decides the month an entry counts in on Inicio. Its month must be inside
 *    the usual month window. Default: today.
 */

export const GoalStatus = z.enum(["active", "completed", "archived"]);
export type GoalStatus = z.infer<typeof GoalStatus>;

export const GoalEntryKind = z.enum(["ALLOCATION", "WITHDRAWAL", "CORRECTION"]);
export type GoalEntryKind = z.infer<typeof GoalEntryKind>;

export const goalSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  description: z.string().nullable(),
  targetAmount: moneySchema.nullable(),
  targetDate: dateOnlySchema.nullable(),
  currency: z.string(),
  status: GoalStatus,
  balance: moneySchema,
  createdById: z.number().int(),
  updatedById: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Goal = z.infer<typeof goalSchema>;

export const goalListSchema = z.object({ items: z.array(goalSchema) });
export type GoalList = z.infer<typeof goalListSchema>;

export const goalEntrySchema = z.object({
  id: z.number().int(),
  goalId: z.number().int(),
  kind: GoalEntryKind,
  amount: moneySchema,
  currency: z.string(),
  effectiveDate: dateOnlySchema,
  actorId: z.number().int(),
  notes: z.string().nullable(),
  createdAt: z.string(),
});
export type GoalEntry = z.infer<typeof goalEntrySchema>;

export const goalEntryListSchema = z.object({ items: z.array(goalEntrySchema) });
export type GoalEntryList = z.infer<typeof goalEntryListSchema>;

const nameSchema = z.string().trim().min(1).max(120);
const descriptionSchema = z.string().trim().max(500);

export const goalCreateSchema = z.object({
  name: nameSchema,
  description: descriptionSchema.nullable().optional(),
  targetAmount: positiveMoneySchema.nullable().optional(),
  targetDate: dateOnlySchema.nullable().optional(),
});
export type GoalCreate = z.infer<typeof goalCreateSchema>;

export const goalPatchSchema = z
  .object({
    name: nameSchema,
    description: descriptionSchema.nullable(),
    targetAmount: positiveMoneySchema.nullable(),
    targetDate: dateOnlySchema.nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Empty patch");
export type GoalPatch = z.infer<typeof goalPatchSchema>;

/** Body of an allocation or a withdrawal. */
export const goalMoveSchema = z.object({
  amount: positiveMoneySchema,
  effectiveDate: dateOnlySchema.optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});
export type GoalMove = z.infer<typeof goalMoveSchema>;
