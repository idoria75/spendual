import {
  positiveMoneySchema,
  transactionCreateSchema,
  transactionPatchSchema,
  type Scope,
  type Transaction,
  type TransactionCreate,
  type TransactionPatch,
  type TransactionType,
} from "@spendual/shared";
import { parseAmountInput } from "../../lib/currency";

export interface FormValues {
  type: TransactionType;
  amount: string;
  description: string;
  scope: Scope;
  ownerId: number | null;
  categoryId: number | null;
  payerId: number | null;
  date: string;
  paymentMethodId: number | null;
  accountId: number | null;
  relatedTransactionId: number | null;
  notes: string;
}

export type FieldName =
  | "amount"
  | "description"
  | "ownerId"
  | "categoryId"
  | "payerId"
  | "date"
  | "accountId"
  | "relatedTransactionId"
  | "notes";

export type FieldErrors = Partial<Record<FieldName, true>>;

/** Which fields the form shows for a type and scope (same rules as the shared schema). */
export function visibleFields(type: TransactionType, scope: Scope) {
  return {
    owner: scope === "personal",
    category: type === "expense" || type === "income" || type === "other_receipt",
    categoryRequired: type === "expense",
    method: type !== "transfer",
    account: type === "transfer",
    accountInDetails: type !== "transfer",
    related: type === "refund",
  };
}

export function valuesFromTransaction(tx: Transaction): FormValues {
  return {
    type: tx.type,
    amount: tx.amount.replace(".", ","),
    description: tx.description,
    scope: tx.scope,
    ownerId: tx.ownerId,
    categoryId: tx.categoryId,
    payerId: tx.payerId,
    date: tx.transactionDate,
    paymentMethodId: tx.paymentMethodId,
    accountId: tx.accountId,
    relatedTransactionId: tx.relatedTransactionId,
    notes: tx.notes ?? "",
  };
}

const PATH_TO_FIELD: Record<string, FieldName> = {
  amount: "amount",
  description: "description",
  ownerId: "ownerId",
  categoryId: "categoryId",
  payerId: "payerId",
  transactionDate: "date",
  accountId: "accountId",
  relatedTransactionId: "relatedTransactionId",
  notes: "notes",
};

function errorsFromIssues(issues: { path: PropertyKey[] }[]): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of issues) {
    const field = PATH_TO_FIELD[String(issue.path[0])];
    if (field) errors[field] = true;
  }
  return errors;
}

function fallbackAmountError(amount: string | null): FieldErrors {
  return amount === null || !positiveMoneySchema.safeParse(amount).success ? { amount: true } : {};
}

export type Built<T> = { ok: true; body: T } | { ok: false; errors: FieldErrors };

/** Build the POST body from form values, validated with the shared schema. */
export function buildCreate(v: FormValues): Built<TransactionCreate> {
  const amount = parseAmountInput(v.amount);
  const f = visibleFields(v.type, v.scope);
  const candidate = {
    type: v.type,
    amount: amount ?? "",
    description: v.description,
    transactionDate: v.date,
    scope: v.scope,
    ownerId: f.owner ? v.ownerId : null,
    ...(v.payerId !== null ? { payerId: v.payerId } : {}),
    categoryId: f.category ? v.categoryId : null,
    accountId: v.accountId,
    paymentMethodId: f.method ? v.paymentMethodId : null,
    relatedTransactionId: f.related ? v.relatedTransactionId : null,
    ...(v.notes.trim() !== "" ? { notes: v.notes } : {}),
  };
  const parsed = transactionCreateSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      ok: false,
      errors: { ...errorsFromIssues(parsed.error.issues), ...fallbackAmountError(amount) },
    };
  }
  return { ok: true, body: parsed.data };
}

/** Build the PATCH body: only the PATCH-able fields that changed. */
export function buildPatch(v: FormValues, original: Transaction): Built<TransactionPatch | null> {
  const f = visibleFields(original.type, original.scope);
  const amount = parseAmountInput(v.amount);
  const candidate: Record<string, unknown> = {};
  if (amount !== original.amount) candidate.amount = amount ?? "";
  if (v.description !== original.description) candidate.description = v.description;
  if (v.date !== original.transactionDate) candidate.transactionDate = v.date;
  if (f.category && v.categoryId !== original.categoryId) candidate.categoryId = v.categoryId;
  if (v.accountId !== original.accountId) candidate.accountId = v.accountId;
  if (f.method && v.paymentMethodId !== original.paymentMethodId)
    candidate.paymentMethodId = v.paymentMethodId;
  if (v.payerId !== null && v.payerId !== original.payerId) candidate.payerId = v.payerId;
  const notes = v.notes.trim() === "" ? null : v.notes;
  if (notes !== original.notes) candidate.notes = notes;

  const errors: FieldErrors = fallbackAmountError(amount);
  if (original.type === "expense" && v.categoryId === null) errors.categoryId = true;
  if (original.type === "transfer" && v.accountId === null) errors.accountId = true;
  if (Object.keys(candidate).length === 0 && Object.keys(errors).length === 0) {
    return { ok: true, body: null };
  }
  const parsed = transactionPatchSchema.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, errors: { ...errors, ...errorsFromIssues(parsed.error.issues) } };
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, body: parsed.data };
}
