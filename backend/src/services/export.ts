import type { PrismaClient } from "@prisma/client";
import { TRANSACTION_CSV_COLUMNS, type ExportQuery } from "@spendual/shared";
import { toCsv } from "../lib/csv.js";
import { dateOnlyToDate, dateToDateOnly } from "../lib/period.js";

/** Every transaction in the range as CSV, oldest first (ids break ties). */
export async function transactionsCsv(prisma: PrismaClient, query: ExportQuery): Promise<string> {
  const rows = await prisma.transaction.findMany({
    where: {
      ...(query.from || query.to
        ? {
            transactionDate: {
              ...(query.from ? { gte: dateOnlyToDate(query.from) } : {}),
              ...(query.to ? { lte: dateOnlyToDate(query.to) } : {}),
            },
          }
        : {}),
    },
    include: {
      owner: { select: { displayName: true } },
      payer: { select: { displayName: true } },
      category: { select: { name: true } },
      account: { select: { name: true } },
      paymentMethod: { select: { name: true } },
    },
    orderBy: [{ transactionDate: "asc" }, { id: "asc" }],
  });
  return toCsv(
    TRANSACTION_CSV_COLUMNS,
    rows.map((t) => [
      t.id,
      dateToDateOnly(t.transactionDate),
      t.type,
      t.status,
      t.amount.toFixed(2),
      t.description,
      t.scope,
      t.owner?.displayName ?? null,
      t.payer?.displayName ?? null,
      t.category?.name ?? null,
      t.account?.name ?? null,
      t.paymentMethod?.name ?? null,
      t.relatedTransactionId,
      t.notes,
      t.voidReason,
    ]),
  );
}
