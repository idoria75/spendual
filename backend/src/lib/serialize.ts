import { Prisma, type AuditEvent, type Transaction as TxRow } from "@prisma/client";
import type { AuditEventDto, Transaction } from "@spendual/shared";
import { dateToDateOnly } from "./period.js";

/** The one place a Decimal becomes text. Always two places, for example "12.50". */
export const moneyToString = (d: Prisma.Decimal): string => d.toFixed(2);

export const parseMoney = (s: string): Prisma.Decimal => new Prisma.Decimal(s);

export function toTransactionDto(t: TxRow): Transaction {
  return {
    id: t.id,
    type: t.type,
    status: t.status,
    amount: moneyToString(t.amount),
    currency: t.currency,
    description: t.description,
    transactionDate: dateToDateOnly(t.transactionDate),
    scope: t.scope,
    ownerId: t.ownerId,
    payerId: t.payerId,
    categoryId: t.categoryId,
    accountId: t.accountId,
    paymentMethodId: t.paymentMethodId,
    relatedTransactionId: t.relatedTransactionId,
    notes: t.notes,
    voidReason: t.voidReason,
    createdById: t.createdById,
    updatedById: t.updatedById,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

export function toAuditDto(e: AuditEvent): AuditEventDto {
  return {
    id: e.id,
    actorId: e.actorId,
    action: e.action,
    before: e.before,
    after: e.after,
    reason: e.reason,
    createdAt: e.createdAt.toISOString(),
  };
}
