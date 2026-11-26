import {
  accountSchema,
  categorySchema,
  lookupsSchema,
  paymentMethodSchema,
  duplicateGroupsSchema,
  transactionListSchema,
  transactionSchema,
  type Account,
  type AccountInput,
  type AccountPatch,
  type Category,
  type CategoryInput,
  type CategoryPatch,
  type Lookups,
  type PaymentMethod,
  type PaymentMethodInput,
  type PaymentMethodPatch,
  type Transaction,
  type DuplicateGroups,
  type TransactionCreate,
  type TransactionListQuery,
  type TransactionPatch,
} from "@spendual/shared";
import { api } from "../../lib/api-client";

export const fetchLookups = (): Promise<Lookups> => api.get("/lookups", lookupsSchema);

export const createCategory = (b: CategoryInput): Promise<Category> =>
  api.post("/categories", b, categorySchema);
export const patchCategory = (id: number, b: CategoryPatch): Promise<Category> =>
  api.patch(`/categories/${id}`, b, categorySchema);
export const createAccount = (b: AccountInput): Promise<Account> =>
  api.post("/accounts", b, accountSchema);
export const patchAccount = (id: number, b: AccountPatch): Promise<Account> =>
  api.patch(`/accounts/${id}`, b, accountSchema);
export const createPaymentMethod = (b: PaymentMethodInput): Promise<PaymentMethod> =>
  api.post("/payment-methods", b, paymentMethodSchema);
export const patchPaymentMethod = (id: number, b: PaymentMethodPatch): Promise<PaymentMethod> =>
  api.patch(`/payment-methods/${id}`, b, paymentMethodSchema);

export async function listTransactions(query: TransactionListQuery): Promise<Transaction[]> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const res = await api.get(`/transactions?${params.toString()}`, transactionListSchema);
  return res.items;
}

export const correctTransaction = (id: number, b: TransactionCreate): Promise<Transaction> =>
  api.post(`/transactions/${id}/correct`, b, transactionSchema);

/** Confirmed records that look like the one about to be saved (same rule as the duplicates list). */
export async function findSimilar(b: TransactionCreate): Promise<Transaction[]> {
  const params = new URLSearchParams({
    type: b.type,
    amount: b.amount,
    transactionDate: b.transactionDate,
    scope: b.scope,
    description: b.description,
  });
  if (b.ownerId != null) params.set("ownerId", String(b.ownerId));
  const res = await api.get(`/transactions/similar?${params.toString()}`, transactionListSchema);
  return res.items;
}

export const fetchDuplicates = (month: string): Promise<DuplicateGroups> =>
  api.get(`/transactions/duplicates?month=${month}`, duplicateGroupsSchema);

export const createTransaction = (b: TransactionCreate): Promise<Transaction> =>
  api.post("/transactions", b, transactionSchema);
export const patchTransaction = (id: number, b: TransactionPatch): Promise<Transaction> =>
  api.patch(`/transactions/${id}`, b, transactionSchema);
export const voidTransaction = (id: number, reason: string): Promise<Transaction> =>
  api.post(`/transactions/${id}/void`, { reason }, transactionSchema);
export const cancelTransaction = (id: number, reason: string): Promise<Transaction> =>
  api.post(`/transactions/${id}/cancel`, { reason }, transactionSchema);
