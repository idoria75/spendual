import { Prisma, type PersonalAllowanceEntry, type PrismaClient } from "@prisma/client";
import { withRetry } from "../lib/withRetry.js";

export class AllocationExistsError extends Error {
  constructor(
    public readonly ownerId: number,
    public readonly periodKey: string,
  ) {
    super(`Allocation already exists for owner ${ownerId} in ${periodKey}`);
    this.name = "AllocationExistsError";
  }
}

export class OwnerNotFoundError extends Error {
  constructor(public readonly ownerId: number) {
    super(`Owner ${ownerId} not found`);
    this.name = "OwnerNotFoundError";
  }
}

export interface CreateAllocationInput {
  ownerId: number;
  periodKey: string;
  amount: string;
  actorId: number;
  notes?: string;
}

/**
 * Create the one ALLOCATION row for an owner and period.
 * The unique rule lives here, not in the database, so adjustments stay unlimited.
 * Lock the owner User row, check, then insert, all in one transaction.
 */
export function createAllocation(
  prisma: PrismaClient,
  input: CreateAllocationInput,
): Promise<PersonalAllowanceEntry> {
  return withRetry(() =>
    prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: number }[]>(
        Prisma.sql`SELECT id FROM User WHERE id = ${input.ownerId} FOR UPDATE`,
      );
      if (rows.length === 0) throw new OwnerNotFoundError(input.ownerId);
      const existing = await tx.personalAllowanceEntry.findFirst({
        where: { ownerId: input.ownerId, periodKey: input.periodKey, kind: "ALLOCATION" },
        select: { id: true },
      });
      if (existing) throw new AllocationExistsError(input.ownerId, input.periodKey);
      return tx.personalAllowanceEntry.create({
        data: {
          ownerId: input.ownerId,
          periodKey: input.periodKey,
          kind: "ALLOCATION",
          amount: input.amount,
          actorId: input.actorId,
          notes: input.notes,
        },
      });
    }),
  );
}

/** Balance is always derived from the ledger. Returns a Decimal. */
export async function allowanceBalance(
  prisma: PrismaClient,
  ownerId: number,
  periodKey: string,
): Promise<Prisma.Decimal> {
  const agg = await prisma.personalAllowanceEntry.aggregate({
    where: { ownerId, periodKey },
    _sum: { amount: true },
  });
  return agg._sum.amount ?? new Prisma.Decimal(0);
}
