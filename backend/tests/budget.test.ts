import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { budgetFor, editBudget } from "../src/services/budget.js";
import { resetDb, testPrisma } from "./helpers/testDb.js";

describe("editBudget", () => {
  let prisma: PrismaClient;
  let catId: number;

  beforeAll(() => {
    prisma = testPrisma();
  });
  afterAll(() => prisma.$disconnect());
  beforeEach(async () => {
    await resetDb(prisma);
    await prisma.household.create({ data: { id: 1, name: "Casa" } });
    catId = (await prisma.category.create({ data: { name: "Mercado" } })).id;
  });

  const rows = async (categoryId: number | null) => {
    const key = categoryId === null ? "overall" : String(categoryId);
    const list = await prisma.monthlyBudget.findMany({
      where: { categoryKey: key },
      orderBy: { effectiveFrom: "asc" },
    });
    return list.map((r) => [r.effectiveFrom, r.amount.toFixed(2)]);
  };
  const amountAt = async (categoryId: number | null, period: string) =>
    (await budgetFor(prisma, categoryId, period))?.amount.toFixed(2);

  it("going forward upserts the row at P", async () => {
    await editBudget(prisma, {
      categoryId: catId,
      period: "2026-03",
      amount: "500.00",
      mode: "going_forward",
    });
    await editBudget(prisma, {
      categoryId: catId,
      period: "2026-03",
      amount: "600.00",
      mode: "going_forward",
    });
    expect(await rows(catId)).toEqual([["2026-03", "600.00"]]);
    expect(await amountAt(catId, "2026-02")).toBeUndefined();
    expect(await amountAt(catId, "2027-01")).toBe("600.00");
  });

  it("this period only inserts P+1 with the prior amount", async () => {
    await editBudget(prisma, {
      categoryId: catId,
      period: "2026-01",
      amount: "500.00",
      mode: "going_forward",
    });
    await editBudget(prisma, {
      categoryId: catId,
      period: "2026-03",
      amount: "900.00",
      mode: "this_period_only",
    });
    expect(await rows(catId)).toEqual([
      ["2026-01", "500.00"],
      ["2026-03", "900.00"],
      ["2026-04", "500.00"],
    ]);
    expect(await amountAt(catId, "2026-02")).toBe("500.00");
    expect(await amountAt(catId, "2026-03")).toBe("900.00");
    expect(await amountAt(catId, "2026-04")).toBe("500.00");
    expect(await amountAt(catId, "2026-09")).toBe("500.00");
  });

  it("this period only leaves an existing P+1 alone", async () => {
    await editBudget(prisma, {
      categoryId: catId,
      period: "2026-01",
      amount: "500.00",
      mode: "going_forward",
    });
    await editBudget(prisma, {
      categoryId: catId,
      period: "2026-04",
      amount: "700.00",
      mode: "going_forward",
    });
    await editBudget(prisma, {
      categoryId: catId,
      period: "2026-03",
      amount: "900.00",
      mode: "this_period_only",
    });
    expect(await rows(catId)).toEqual([
      ["2026-01", "500.00"],
      ["2026-03", "900.00"],
      ["2026-04", "700.00"],
    ]);
  });

  it("two this-period-only edits at the same P keep the first prior amount at P+1", async () => {
    await editBudget(prisma, {
      categoryId: catId,
      period: "2026-01",
      amount: "500.00",
      mode: "going_forward",
    });
    await editBudget(prisma, {
      categoryId: catId,
      period: "2026-03",
      amount: "900.00",
      mode: "this_period_only",
    });
    await editBudget(prisma, {
      categoryId: catId,
      period: "2026-03",
      amount: "1000.00",
      mode: "this_period_only",
    });
    expect(await rows(catId)).toEqual([
      ["2026-01", "500.00"],
      ["2026-03", "1000.00"],
      ["2026-04", "500.00"],
    ]);
  });

  it("going forward then this period only at the same P uses the going-forward amount", async () => {
    await editBudget(prisma, {
      categoryId: catId,
      period: "2026-03",
      amount: "800.00",
      mode: "going_forward",
    });
    await editBudget(prisma, {
      categoryId: catId,
      period: "2026-03",
      amount: "100.00",
      mode: "this_period_only",
    });
    expect(await rows(catId)).toEqual([
      ["2026-03", "100.00"],
      ["2026-04", "800.00"],
    ]);
  });

  it("this period only with no earlier budget adds no P+1 row", async () => {
    await editBudget(prisma, {
      categoryId: null,
      period: "2026-03",
      amount: "100.00",
      mode: "this_period_only",
    });
    expect(await rows(null)).toEqual([["2026-03", "100.00"]]);
  });

  it("never changes past periods and handles the year end", async () => {
    await editBudget(prisma, {
      categoryId: null,
      period: "2026-01",
      amount: "10.00",
      mode: "going_forward",
    });
    await editBudget(prisma, {
      categoryId: null,
      period: "2026-12",
      amount: "20.00",
      mode: "this_period_only",
    });
    expect(await rows(null)).toEqual([
      ["2026-01", "10.00"],
      ["2026-12", "20.00"],
      ["2027-01", "10.00"],
    ]);
  });

  it("keeps the overall budget separate from category budgets", async () => {
    await editBudget(prisma, {
      categoryId: null,
      period: "2026-01",
      amount: "5000.00",
      mode: "going_forward",
    });
    await editBudget(prisma, {
      categoryId: catId,
      period: "2026-01",
      amount: "500.00",
      mode: "going_forward",
    });
    expect(await amountAt(null, "2026-01")).toBe("5000.00");
    expect(await amountAt(catId, "2026-01")).toBe("500.00");
  });

  it("parallel edits at the same P end with one row at P", async () => {
    await editBudget(prisma, {
      categoryId: catId,
      period: "2026-01",
      amount: "500.00",
      mode: "going_forward",
    });
    await Promise.all(
      ["600.00", "700.00", "800.00"].map((amount) =>
        editBudget(prisma, {
          categoryId: catId,
          period: "2026-03",
          amount,
          mode: "this_period_only",
        }),
      ),
    );
    const list = await rows(catId);
    expect(list.filter(([p]) => p === "2026-03")).toHaveLength(1);
    expect(list.filter(([p]) => p === "2026-04")).toHaveLength(1);
  });
});
