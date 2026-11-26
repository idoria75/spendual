import type { PrismaClient, Transaction as TxRow } from "@prisma/client";
import {
  DUPLICATE_DAYS,
  type DuplicateGroups,
  type SimilarQuery,
  type Transaction,
} from "@spendual/shared";
import { dateOnlyToDate, nextPeriod } from "../lib/period.js";
import { toTransactionDto } from "../lib/serialize.js";

const DAY_MS = 86_400_000;
const MAX_SIMILAR = 5;

/** Lower case, no accents, single spaces. "  Pão  Francês " and "pao frances" match. */
export function normalizeText(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

const near = (a: Date, b: Date) => Math.abs(a.getTime() - b.getTime()) <= DUPLICATE_DAYS * DAY_MS;

/** Confirmed records that look like the one being entered. */
export async function findSimilar(prisma: PrismaClient, q: SimilarQuery): Promise<Transaction[]> {
  const date = dateOnlyToDate(q.transactionDate);
  const rows = await prisma.transaction.findMany({
    where: {
      status: "confirmed",
      type: q.type,
      amount: q.amount,
      scope: q.scope,
      ...(q.scope === "personal" && q.ownerId ? { ownerId: q.ownerId } : {}),
      transactionDate: {
        gte: new Date(date.getTime() - DUPLICATE_DAYS * DAY_MS),
        lte: new Date(date.getTime() + DUPLICATE_DAYS * DAY_MS),
      },
    },
    orderBy: [{ transactionDate: "desc" }, { id: "desc" }],
  });
  const wanted = normalizeText(q.description);
  return rows
    .filter((r) => normalizeText(r.description) === wanted)
    .slice(0, MAX_SIMILAR)
    .map(toTransactionDto);
}

/** Groups of 2 or more confirmed records of the month that look the same. */
export async function listDuplicateGroups(
  prisma: PrismaClient,
  month: string,
): Promise<DuplicateGroups> {
  const rows = await prisma.transaction.findMany({
    where: {
      status: "confirmed",
      transactionDate: {
        gte: dateOnlyToDate(`${month}-01`),
        lt: dateOnlyToDate(`${nextPeriod(month)}-01`),
      },
    },
    orderBy: [{ transactionDate: "asc" }, { id: "asc" }],
  });
  const keyOf = (r: TxRow) =>
    [
      r.type,
      r.amount.toFixed(2),
      r.scope,
      r.scope === "personal" ? r.ownerId : "",
      normalizeText(r.description),
    ].join("|");
  const byKey = new Map<string, TxRow[]>();
  for (const r of rows) byKey.set(keyOf(r), [...(byKey.get(keyOf(r)) ?? []), r]);

  const groups: TxRow[][] = [];
  for (const list of byKey.values()) {
    // Chain records whose dates are within the window of the previous one.
    let current: TxRow[] = [];
    for (const r of list) {
      const last = current[current.length - 1];
      if (last && !near(last.transactionDate, r.transactionDate)) {
        if (current.length > 1) groups.push(current);
        current = [];
      }
      current.push(r);
    }
    if (current.length > 1) groups.push(current);
  }
  groups.sort((a, b) => {
    const da = a[a.length - 1].transactionDate.getTime();
    const db = b[b.length - 1].transactionDate.getTime();
    return db - da || b[0].id - a[0].id;
  });
  return { groups: groups.map((g) => ({ items: g.map(toTransactionDto).reverse() })) };
}
