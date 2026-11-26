import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  AllocationExistsError,
  OwnerNotFoundError,
  allowanceBalance,
  createAllocation,
} from "../src/services/allowance.js";
import { makeUser, resetDb, testPrisma } from "./helpers/testDb.js";

describe("createAllocation", () => {
  let prisma: PrismaClient;
  let ana: { id: number };
  let beto: { id: number };

  beforeAll(() => {
    prisma = testPrisma();
  });
  afterAll(() => prisma.$disconnect());
  beforeEach(async () => {
    await resetDb(prisma);
    ana = await makeUser(prisma, "ana");
    beto = await makeUser(prisma, "beto");
  });

  const input = (ownerId: number, periodKey = "2026-10") => ({
    ownerId,
    periodKey,
    amount: "1000.00",
    actorId: ownerId,
  });

  it("creates one ALLOCATION and rejects a second", async () => {
    await createAllocation(prisma, input(ana.id));
    await expect(createAllocation(prisma, input(ana.id))).rejects.toBeInstanceOf(
      AllocationExistsError,
    );
    expect(await prisma.personalAllowanceEntry.count({ where: { kind: "ALLOCATION" } })).toBe(1);
  });

  it("allows another owner, another period, and unlimited adjustments", async () => {
    await createAllocation(prisma, input(ana.id));
    await createAllocation(prisma, input(beto.id));
    await createAllocation(prisma, input(ana.id, "2026-11"));
    for (const amount of ["-50.00", "25.00", "10.00"]) {
      await prisma.personalAllowanceEntry.create({
        data: {
          ownerId: ana.id,
          periodKey: "2026-10",
          kind: "ADJUSTMENT",
          amount,
          actorId: ana.id,
        },
      });
    }
    expect((await allowanceBalance(prisma, ana.id, "2026-10")).toFixed(2)).toBe("985.00");
    expect((await allowanceBalance(prisma, ana.id, "2027-01")).toFixed(2)).toBe("0.00");
  });

  it("has no database unique key on allocations", async () => {
    const data = {
      ownerId: ana.id,
      periodKey: "2026-10",
      kind: "ALLOCATION" as const,
      amount: "1.00",
      actorId: ana.id,
    };
    await prisma.personalAllowanceEntry.create({ data });
    await prisma.personalAllowanceEntry.create({ data });
    expect(await prisma.personalAllowanceEntry.count()).toBe(2);
  });

  it("rejects an unknown owner", async () => {
    await expect(createAllocation(prisma, input(99999))).rejects.toBeInstanceOf(OwnerNotFoundError);
  });

  it("concurrent inserts give exactly one ALLOCATION", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => createAllocation(prisma, input(ana.id))),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failures = results.filter((r) => r.status === "rejected");
    expect(failures).toHaveLength(9);
    for (const f of failures)
      expect((f as PromiseRejectedResult).reason).toBeInstanceOf(AllocationExistsError);
    expect(await prisma.personalAllowanceEntry.count({ where: { kind: "ALLOCATION" } })).toBe(1);
  });
});
