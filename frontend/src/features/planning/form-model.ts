import {
  installmentPlanCreateSchema,
  recurrenceRuleCreateSchema,
  type InstallmentPlanCreate,
  type RecurrenceRuleCreate,
  type Scope,
} from "@spendual/shared";
import { fromCents, parseAmountInput, toCents } from "../../lib/currency";

export interface PlanningValues {
  description: string;
  amount: string;
  /** Rule only: the amount is not known yet. */
  unknown: boolean;
  count: string;
  day: string;
  startDate: string;
  endDate: string;
  scope: Scope;
  ownerId: number | null;
  payerId: number | null;
  categoryId: number | null;
  accountId: number | null;
  paymentMethodId: number | null;
}

export type PlanningField =
  "description" | "amount" | "count" | "day" | "startDate" | "endDate" | "ownerId" | "categoryId";
export type PlanningErrors = Partial<Record<PlanningField, true>>;
export type PlanningBuilt<T> = { ok: true; body: T } | { ok: false; errors: PlanningErrors };

const PATH_TO_FIELD: Record<string, PlanningField> = {
  description: "description",
  expectedAmount: "amount",
  totalAmount: "amount",
  installmentCount: "count",
  dayOfMonth: "day",
  startDate: "startDate",
  firstDueDate: "startDate",
  endDate: "endDate",
  ownerId: "ownerId",
  categoryId: "categoryId",
};

function errorsFrom(issues: { path: PropertyKey[] }[]): PlanningErrors {
  const errors: PlanningErrors = {};
  for (const issue of issues) {
    const field = PATH_TO_FIELD[String(issue.path[0])];
    if (field) errors[field] = true;
  }
  return errors;
}

function common(v: PlanningValues) {
  return {
    description: v.description,
    scope: v.scope,
    ownerId: v.scope === "personal" ? v.ownerId : null,
    ...(v.payerId !== null ? { payerId: v.payerId } : {}),
    categoryId: v.categoryId ?? 0,
    accountId: v.accountId,
  };
}

/** Body of POST /recurrence-rules. Unknown amount sends null, never "0.00". */
export function buildRule(v: PlanningValues): PlanningBuilt<RecurrenceRuleCreate> {
  const amount = parseAmountInput(v.amount);
  const parsed = recurrenceRuleCreateSchema.safeParse({
    ...common(v),
    expectedAmount: v.unknown ? null : (amount ?? ""),
    dayOfMonth: /^\d+$/.test(v.day) ? Number(v.day) : 0,
    startDate: v.startDate,
    endDate: v.endDate === "" ? null : v.endDate,
    paymentMethodId: v.paymentMethodId,
  });
  if (!parsed.success) return { ok: false, errors: errorsFrom(parsed.error.issues) };
  return { ok: true, body: parsed.data };
}

/** Body of POST /installment-plans. */
export function buildPlan(v: PlanningValues): PlanningBuilt<InstallmentPlanCreate> {
  const amount = parseAmountInput(v.amount);
  const parsed = installmentPlanCreateSchema.safeParse({
    ...common(v),
    totalAmount: amount ?? "",
    installmentCount: /^\d+$/.test(v.count) ? Number(v.count) : 0,
    firstDueDate: v.startDate,
  });
  if (!parsed.success) return { ok: false, errors: errorsFrom(parsed.error.issues) };
  return { ok: true, body: parsed.data };
}

/**
 * Live preview "10x R$ 410,00": the base installment and the last one.
 * The remainder cents go to the last installment (ui-guidelines §7.1).
 */
export function splitPreview(
  total: string,
  count: string,
): { n: number; each: string; last: string; total: string } | null {
  const amount = parseAmountInput(total);
  if (amount === null || !/^\d+$/.test(count)) return null;
  const n = Number(count);
  const cents = toCents(amount);
  if (n < 2 || n > 60 || cents <= 0n) return null;
  const base = cents / BigInt(n);
  const last = cents - base * BigInt(n - 1);
  return { n, each: fromCents(base), last: fromCents(last), total: fromCents(cents) };
}
