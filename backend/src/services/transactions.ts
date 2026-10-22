import { Prisma, type PrismaClient, type Transaction as TxRow } from "@prisma/client";
import type {
  AuditEventDto,
  CategoryKind,
  Transaction,
  TransactionCreate,
  TransactionListQuery,
  TransactionPatch,
} from "@spendual/shared";
import { parseCategoryList } from "@spendual/shared";
import { AppError } from "../auth/errors.js";
import { writeAudit } from "../lib/audit.js";
import { dateOnlyToDate, nextPeriod } from "../lib/period.js";
import { parseMoney, toAuditDto, toTransactionDto } from "../lib/serialize.js";
import { withRetry } from "../lib/withRetry.js";

type Db = Prisma.TransactionClient;

const ENTITY = "Transaction";

export const invalid = (field: string, message: string) =>
  new AppError(400, "validation_error", "Invalid request", { [field]: message });

/** Lock the row until the DB transaction ends. Returns it fresh, or throws 404. */
async function lockTransaction(tx: Db, id: number): Promise<TxRow> {
  const rows = await tx.$queryRaw<{ id: number }[]>`
    SELECT id FROM \`Transaction\` WHERE id = ${id} FOR UPDATE`;
  const row = rows.length > 0 ? await tx.transaction.findUnique({ where: { id } }) : null;
  if (!row) throw new AppError(404, "not_found", "Transaction not found");
  return row;
}

export async function assertActiveUser(tx: Db, id: number, field: string): Promise<void> {
  const user = await tx.user.findUnique({ where: { id }, select: { active: true } });
  if (!user?.active) throw invalid(field, "Unknown or inactive user");
}

interface CatalogIds {
  categoryId?: number | null;
  accountId?: number | null;
  paymentMethodId?: number | null;
}

/** Each given id must exist and be active. */
export async function assertCatalogActive(
  tx: Db,
  ids: CatalogIds,
  categoryKind?: CategoryKind,
): Promise<void> {
  if (ids.categoryId != null) {
    const c = await tx.category.findUnique({ where: { id: ids.categoryId } });
    if (!c?.active) throw invalid("categoryId", "Unknown or archived category");
    if (categoryKind && c.kind !== categoryKind) {
      throw invalid("categoryId", `Must be an ${categoryKind} category`);
    }
  }
  if (ids.accountId != null) {
    const a = await tx.account.findUnique({ where: { id: ids.accountId } });
    if (!a?.active) throw invalid("accountId", "Unknown or archived account");
  }
  if (ids.paymentMethodId != null) {
    const p = await tx.paymentMethod.findUnique({ where: { id: ids.paymentMethodId } });
    if (!p?.active) throw invalid("paymentMethodId", "Unknown or archived payment method");
  }
}

/** Sum of confirmed refunds linked to an expense, optionally leaving one refund out. */
async function confirmedRefundsSum(
  tx: Db,
  expenseId: number,
  exceptId?: number,
): Promise<Prisma.Decimal> {
  const agg = await tx.transaction.aggregate({
    _sum: { amount: true },
    where: {
      relatedTransactionId: expenseId,
      type: "refund",
      status: "confirmed",
      ...(exceptId === undefined ? {} : { id: { not: exceptId } }),
    },
  });
  return agg._sum.amount ?? new Prisma.Decimal(0);
}

function assertRefundFits(expense: TxRow, others: Prisma.Decimal, refund: Prisma.Decimal): void {
  if (others.plus(refund).gt(expense.amount)) {
    throw new AppError(409, "refund_exceeds", "Refunds would be more than the expense", {
      amount: "Refunds would be more than the expense",
    });
  }
}

/** Category kind a transaction type needs. Transfer has no category. */
function kindFor(type: TxRow["type"]): CategoryKind | undefined {
  if (type === "expense" || type === "refund") return "expense";
  if (type === "income" || type === "other_receipt") return "income";
  return undefined;
}

export async function listTransactions(
  prisma: PrismaClient,
  q: TransactionListQuery,
): Promise<Transaction[]> {
  // Planned rows never show in this list.
  if (q.status === "planned") return [];
  const month = {
    gte: dateOnlyToDate(`${q.month}-01`),
    lt: dateOnlyToDate(`${nextPeriod(q.month)}-01`),
  };
  const where: Prisma.TransactionWhereInput = {
    status: q.status ?? { not: "planned" },
    ...(q.scope ? { scope: q.scope } : {}),
    ...(q.personId
      ? {
          OR: [
            { scope: "personal", ownerId: q.personId },
            { scope: "household", payerId: q.personId },
          ],
        }
      : {}),
  };
  if (q.categories) {
    // Drill-down: the month belongs to the expense, so a refund is found through its expense.
    const { ids, none } = parseCategoryList(q.categories);
    const expense: Prisma.TransactionWhereInput = {
      type: "expense",
      transactionDate: month,
      OR: [
        ...(ids.length ? [{ categoryId: { in: ids } }] : []),
        ...(none ? [{ categoryId: null }] : []),
      ],
    };
    where.AND = [{ OR: [expense, { type: "refund", relatedTransaction: { is: expense } }] }];
  } else {
    where.transactionDate = month;
    if (q.type) where.type = q.type;
    if (q.categoryId) where.categoryId = q.categoryId;
  }
  const rows = await prisma.transaction.findMany({
    where,
    orderBy: [{ transactionDate: "desc" }, { id: "desc" }],
  });
  return rows.map(toTransactionDto);
}

export async function getTransaction(prisma: PrismaClient, id: number): Promise<Transaction> {
  const row = await prisma.transaction.findUnique({ where: { id } });
  if (!row) throw new AppError(404, "not_found", "Transaction not found");
  return toTransactionDto(row);
}

export async function listAudit(prisma: PrismaClient, id: number): Promise<AuditEventDto[]> {
  await getTransaction(prisma, id);
  const rows = await prisma.auditEvent.findMany({
    where: { entityType: ENTITY, entityId: String(id) },
    orderBy: { id: "desc" },
  });
  return rows.map(toAuditDto);
}

export function createTransaction(
  prisma: PrismaClient,
  actorId: number,
  input: TransactionCreate,
): Promise<Transaction> {
  const amount = parseMoney(input.amount);
  return withRetry(() =>
    prisma.$transaction(async (tx) => {
      // The refund lock must come first. Any earlier plain read would fix the snapshot
      // before the lock, and the refund sum would then miss a refund that just committed.
      if (input.type === "refund") {
        const relatedId = input.relatedTransactionId as number;
        const related = await tx.$queryRaw<{ id: number }[]>`
          SELECT id FROM \`Transaction\` WHERE id = ${relatedId} FOR UPDATE`;
        const expense = related.length
          ? await tx.transaction.findUnique({ where: { id: relatedId } })
          : null;
        if (!expense || expense.type !== "expense" || expense.status !== "confirmed") {
          throw invalid("relatedTransactionId", "Must be a confirmed expense");
        }
        assertRefundFits(expense, await confirmedRefundsSum(tx, expense.id), amount);
      }

      const payerId = input.payerId ?? actorId;
      await assertActiveUser(tx, payerId, "payerId");
      if (input.ownerId != null) await assertActiveUser(tx, input.ownerId, "ownerId");
      await assertCatalogActive(tx, input, kindFor(input.type));

      const row = await tx.transaction.create({
        data: {
          type: input.type,
          status: "confirmed",
          amount,
          description: input.description,
          transactionDate: dateOnlyToDate(input.transactionDate),
          scope: input.scope,
          ownerId: input.ownerId ?? null,
          payerId,
          categoryId: input.categoryId ?? null,
          accountId: input.accountId ?? null,
          paymentMethodId: input.paymentMethodId ?? null,
          relatedTransactionId: input.relatedTransactionId ?? null,
          notes: input.notes ?? null,
          createdById: actorId,
          updatedById: actorId,
        },
      });
      const after = toTransactionDto(row);
      await writeAudit(tx, {
        actorId,
        entityType: ENTITY,
        entityId: row.id,
        action: "transaction.create",
        after,
      });
      return after;
    }),
  );
}

function requireStatus(row: TxRow, status: TxRow["status"]): void {
  if (row.status !== status) {
    throw new AppError(409, "invalid_state", `Transaction is ${row.status}, not ${status}`);
  }
}

export function patchTransaction(
  prisma: PrismaClient,
  actorId: number,
  id: number,
  patch: TransactionPatch,
): Promise<Transaction> {
  return withRetry(() =>
    prisma.$transaction(async (tx) => {
      const cur = await lockTransaction(tx, id);
      requireStatus(cur, "confirmed");

      const next = {
        categoryId: patch.categoryId !== undefined ? patch.categoryId : cur.categoryId,
        accountId: patch.accountId !== undefined ? patch.accountId : cur.accountId,
      };
      if (cur.type === "expense" && next.categoryId == null) {
        throw invalid("categoryId", "Category required");
      }
      if (cur.type === "transfer") {
        if (next.accountId == null) throw invalid("accountId", "Account required");
        if (next.categoryId != null) throw invalid("categoryId", "Transfer has no category");
      }

      // Only newly chosen catalog items must be active. An old archived one may stay.
      const changed: CatalogIds = {};
      if (patch.categoryId != null && patch.categoryId !== cur.categoryId)
        changed.categoryId = patch.categoryId;
      if (patch.accountId != null && patch.accountId !== cur.accountId)
        changed.accountId = patch.accountId;
      if (patch.paymentMethodId != null && patch.paymentMethodId !== cur.paymentMethodId)
        changed.paymentMethodId = patch.paymentMethodId;
      await assertCatalogActive(tx, changed, kindFor(cur.type));
      if (patch.payerId !== undefined && patch.payerId !== cur.payerId) {
        await assertActiveUser(tx, patch.payerId, "payerId");
      }

      const amount = patch.amount === undefined ? undefined : parseMoney(patch.amount);
      if (amount && !amount.eq(cur.amount)) {
        if (cur.type === "expense") {
          const refunds = await confirmedRefundsSum(tx, cur.id);
          if (refunds.gt(amount)) {
            throw new AppError(
              409,
              "refund_exceeds",
              "Confirmed refunds are more than the amount",
              {
                amount: "Confirmed refunds are more than the amount",
              },
            );
          }
        } else if (cur.type === "refund" && cur.relatedTransactionId != null) {
          const expense = await lockTransaction(tx, cur.relatedTransactionId);
          assertRefundFits(expense, await confirmedRefundsSum(tx, expense.id, cur.id), amount);
        }
      }

      const row = await tx.transaction.update({
        where: { id },
        data: {
          ...(amount ? { amount } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          ...(patch.transactionDate !== undefined
            ? { transactionDate: dateOnlyToDate(patch.transactionDate) }
            : {}),
          ...(patch.categoryId !== undefined ? { categoryId: patch.categoryId } : {}),
          ...(patch.accountId !== undefined ? { accountId: patch.accountId } : {}),
          ...(patch.paymentMethodId !== undefined
            ? { paymentMethodId: patch.paymentMethodId }
            : {}),
          ...(patch.payerId !== undefined ? { payerId: patch.payerId } : {}),
          ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
          updatedById: actorId,
        },
      });
      const after = toTransactionDto(row);
      await writeAudit(tx, {
        actorId,
        entityType: ENTITY,
        entityId: id,
        action: "transaction.update",
        before: toTransactionDto(cur),
        after,
      });
      return after;
    }),
  );
}

/** Shared by void and cancel: lock, check status, close the row, write the audit row. */
function closeTransaction(
  prisma: PrismaClient,
  actorId: number,
  id: number,
  reason: string,
  from: "confirmed" | "planned",
): Promise<Transaction> {
  const to = from === "confirmed" ? "voided" : "cancelled";
  return withRetry(() =>
    prisma.$transaction(async (tx) => {
      const cur = await lockTransaction(tx, id);
      requireStatus(cur, from);
      if (cur.type === "expense" && from === "confirmed") {
        const refunds = await tx.transaction.count({
          where: { relatedTransactionId: id, type: "refund", status: "confirmed" },
        });
        if (refunds > 0) {
          throw new AppError(409, "has_refunds", "Void the confirmed refunds first");
        }
      }
      const row = await tx.transaction.update({
        where: { id },
        data: { status: to, voidReason: reason, updatedById: actorId },
      });
      const after = toTransactionDto(row);
      await writeAudit(tx, {
        actorId,
        entityType: ENTITY,
        entityId: id,
        action: `transaction.${to === "voided" ? "void" : "cancel"}`,
        before: toTransactionDto(cur),
        after,
        reason,
      });
      return after;
    }),
  );
}

export const voidTransaction = (p: PrismaClient, actorId: number, id: number, reason: string) =>
  closeTransaction(p, actorId, id, reason, "confirmed");

export const cancelTransaction = (p: PrismaClient, actorId: number, id: number, reason: string) =>
  closeTransaction(p, actorId, id, reason, "planned");
