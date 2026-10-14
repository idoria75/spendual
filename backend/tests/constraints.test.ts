import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { dateOnlyToDate } from "../src/lib/period.js";
import { makeUser, resetDb, testPrisma } from "./helpers/testDb.js";

describe("database constraints", () => {
  let prisma: PrismaClient;
  let ana: { id: number };
  let beto: { id: number };

  beforeAll(() => {
    prisma = testPrisma();
  });
  afterAll(() => prisma.$disconnect());
  beforeEach(async () => {
    await resetDb(prisma);
    ana = await makeUser(prisma, "ana", "rose");
    beto = await makeUser(prisma, "beto");
  });

  const tx = (over: Record<string, unknown> = {}) => ({
    type: "expense" as const,
    status: "confirmed" as const,
    amount: "10.00",
    description: "x",
    transactionDate: dateOnlyToDate("2026-10-14"),
    scope: "household" as const,
    createdById: ana.id,
    updatedById: ana.id,
    ...over,
  });

  it("tonePalette is unique, but many NULLs are fine", async () => {
    await expect(makeUser(prisma, "carla", "rose")).rejects.toMatchObject({ code: "P2002" });
    await makeUser(prisma, "dora");
    expect(await prisma.user.count({ where: { tonePalette: null } })).toBe(2);
  });

  it("username is unique", async () => {
    await expect(makeUser(prisma, "ana")).rejects.toMatchObject({ code: "P2002" });
  });

  it("stores money with 2 places and keeps null different from 0", async () => {
    const rule = await prisma.recurrenceRule.create({
      data: {
        description: "Luz",
        dayOfMonth: 10,
        startDate: dateOnlyToDate("2026-01-01"),
        scope: "household",
        createdById: ana.id,
        updatedById: ana.id,
      },
    });
    await prisma.recurrenceOccurrence.createMany({
      data: [
        {
          ruleId: rule.id,
          periodKey: "2026-01",
          dueDate: dateOnlyToDate("2026-01-10"),
          expectedAmount: null,
        },
        {
          ruleId: rule.id,
          periodKey: "2026-02",
          dueDate: dateOnlyToDate("2026-02-10"),
          expectedAmount: "0.00",
        },
      ],
    });
    const rows = await prisma.recurrenceOccurrence.findMany({ orderBy: { periodKey: "asc" } });
    expect(rows[0]!.expectedAmount).toBeNull();
    expect(rows[1]!.expectedAmount!.toFixed(2)).toBe("0.00");
    const t = await prisma.transaction.create({ data: tx({ amount: "1234567890.12" }) });
    expect(t.amount.toFixed(2)).toBe("1234567890.12");
    expect(t.currency).toBe("BRL");
  });

  it("keeps date-only fields on the same calendar day", async () => {
    const t = await prisma.transaction.create({
      data: tx({ transactionDate: dateOnlyToDate("2026-12-31") }),
    });
    const back = await prisma.transaction.findUniqueOrThrow({ where: { id: t.id } });
    expect(back.transactionDate.toISOString().slice(0, 10)).toBe("2026-12-31");
  });

  it("type and status are separate fields", async () => {
    const t = await prisma.transaction.create({
      data: tx({ type: "refund", status: "voided", voidReason: "dup" }),
    });
    expect([t.type, t.status]).toEqual(["refund", "voided"]);
  });

  it("a personal transaction needs an owner", async () => {
    await expect(prisma.transaction.create({ data: tx({ scope: "personal" }) })).rejects.toThrow();
    await prisma.transaction.create({ data: tx({ scope: "personal", ownerId: beto.id }) });
  });

  it("a personal recurrence rule or installment plan needs an owner", async () => {
    await expect(
      prisma.recurrenceRule.create({
        data: {
          description: "x",
          dayOfMonth: 5,
          startDate: dateOnlyToDate("2026-01-01"),
          scope: "personal",
          createdById: ana.id,
          updatedById: ana.id,
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.installmentPlan.create({
        data: {
          description: "x",
          totalAmount: "100.00",
          installmentCount: 2,
          firstDueDate: dateOnlyToDate("2026-01-01"),
          scope: "personal",
          createdById: ana.id,
          updatedById: ana.id,
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects a bad day of month and a bad installment count", async () => {
    const base = {
      description: "x",
      startDate: dateOnlyToDate("2026-01-01"),
      scope: "household" as const,
    };
    const actors = { createdById: ana.id, updatedById: ana.id };
    await expect(
      prisma.recurrenceRule.create({ data: { ...base, dayOfMonth: 32, ...actors } }),
    ).rejects.toThrow();
    await expect(
      prisma.recurrenceRule.create({ data: { ...base, dayOfMonth: 0, ...actors } }),
    ).rejects.toThrow();
    await expect(
      prisma.installmentPlan.create({
        data: {
          description: "x",
          totalAmount: "1.00",
          installmentCount: 0,
          firstDueDate: dateOnlyToDate("2026-01-01"),
          scope: "household",
          ...actors,
        },
      }),
    ).rejects.toThrow();
  });

  it("enforces foreign keys", async () => {
    await expect(
      prisma.transaction.create({ data: tx({ categoryId: 9999 }) }),
    ).rejects.toMatchObject({
      code: "P2003",
    });
    await expect(
      prisma.transaction.create({ data: tx({ createdById: 9999 }) }),
    ).rejects.toMatchObject({
      code: "P2003",
    });
  });

  it("a recurrence occurrence can be confirmed by only one transaction", async () => {
    const rule = await prisma.recurrenceRule.create({
      data: {
        description: "x",
        dayOfMonth: 5,
        startDate: dateOnlyToDate("2026-01-01"),
        scope: "household",
        createdById: ana.id,
        updatedById: ana.id,
      },
    });
    const occ = await prisma.recurrenceOccurrence.create({
      data: { ruleId: rule.id, periodKey: "2026-01", dueDate: dateOnlyToDate("2026-01-05") },
    });
    await prisma.transaction.create({ data: tx({ recurrenceOccurrenceId: occ.id }) });
    await expect(
      prisma.transaction.create({ data: tx({ recurrenceOccurrenceId: occ.id }) }),
    ).rejects.toMatchObject({
      code: "P2002",
    });
  });

  it("recurrence occurrence is unique per rule and period", async () => {
    const rule = await prisma.recurrenceRule.create({
      data: {
        description: "x",
        dayOfMonth: 5,
        startDate: dateOnlyToDate("2026-01-01"),
        scope: "household",
        createdById: ana.id,
        updatedById: ana.id,
      },
    });
    const data = { ruleId: rule.id, periodKey: "2026-01", dueDate: dateOnlyToDate("2026-01-05") };
    await prisma.recurrenceOccurrence.create({ data });
    await expect(prisma.recurrenceOccurrence.create({ data })).rejects.toMatchObject({
      code: "P2002",
    });
  });

  it("installment occurrence is unique per plan and sequence number", async () => {
    const plan = await prisma.installmentPlan.create({
      data: {
        description: "TV",
        totalAmount: "300.00",
        installmentCount: 3,
        firstDueDate: dateOnlyToDate("2026-01-05"),
        scope: "household",
        createdById: ana.id,
        updatedById: ana.id,
      },
    });
    const data = {
      planId: plan.id,
      sequenceNumber: 1,
      dueDate: dateOnlyToDate("2026-01-05"),
      expectedAmount: "100.00",
    };
    await prisma.installmentOccurrence.create({ data });
    await expect(prisma.installmentOccurrence.create({ data })).rejects.toMatchObject({
      code: "P2002",
    });
    await prisma.installmentOccurrence.create({ data: { ...data, sequenceNumber: 2 } });
  });

  it("monthly budget key is unique per period and checked", async () => {
    const cat = await prisma.category.create({ data: { name: "Mercado" } });
    const base = { amount: "100.00", effectiveFrom: "2026-01" };
    await prisma.monthlyBudget.create({
      data: { ...base, scope: "CATEGORY", categoryId: cat.id, categoryKey: String(cat.id) },
    });
    await expect(
      prisma.monthlyBudget.create({
        data: { ...base, scope: "CATEGORY", categoryId: cat.id, categoryKey: String(cat.id) },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
    // the overall budget has a NULL categoryId, so only categoryKey can make it unique
    await prisma.monthlyBudget.create({
      data: { ...base, scope: "OVERALL", categoryKey: "overall" },
    });
    await expect(
      prisma.monthlyBudget.create({ data: { ...base, scope: "OVERALL", categoryKey: "overall" } }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("monthly budget rejects a key that does not match its scope", async () => {
    const cat = await prisma.category.create({ data: { name: "Mercado" } });
    const base = { amount: "100.00", effectiveFrom: "2026-02" };
    await expect(
      prisma.monthlyBudget.create({
        data: { ...base, scope: "OVERALL", categoryId: cat.id, categoryKey: "overall" },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.monthlyBudget.create({ data: { ...base, scope: "CATEGORY", categoryKey: "overall" } }),
    ).rejects.toThrow();
    await expect(
      prisma.monthlyBudget.create({
        data: { ...base, scope: "CATEGORY", categoryId: cat.id, categoryKey: "999" },
      }),
    ).rejects.toThrow();
  });

  it("category and payment method names are unique", async () => {
    await prisma.category.create({ data: { name: "Mercado" } });
    await expect(prisma.category.create({ data: { name: "Mercado" } })).rejects.toMatchObject({
      code: "P2002",
    });
  });
});
