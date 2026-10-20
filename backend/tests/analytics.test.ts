import type { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { categoryTrendsSchema } from "@spendual/shared";
import { editBudget } from "../src/services/budget.js";
import { makeApp } from "./helpers/authApp.js";
import { resetDb, testPrisma } from "./helpers/testDb.js";
import { send, setup, type Ctx } from "./helpers/txApp.js";

let prisma: PrismaClient;
let ctx: Ctx;
beforeAll(() => {
  prisma = testPrisma();
});
afterAll(() => prisma.$disconnect());
beforeEach(async () => {
  await resetDb(prisma);
  ctx = await setup(prisma, { now: () => new Date("2027-03-15T12:00:00Z") });
});

const tx = (body: Record<string, unknown>) =>
  send(ctx.ana, "post", "/api/transactions", {
    scope: "household",
    categoryId: ctx.categoryId,
    description: "x",
    ...body,
  });
const trends = async (from = "2027-01", to = "2027-03") => {
  const res = await ctx.ana.get(`/api/analytics/categories?from=${from}&to=${to}`);
  expect(res.status).toBe(200);
  return categoryTrendsSchema.parse(res.body);
};
const amounts = (s: { points: { amount: string }[] }) => s.points.map((p) => p.amount);

describe("category trends", () => {
  it("needs a session and a valid range", async () => {
    const app = makeApp(prisma);
    expect(
      (await request(app).get("/api/analytics/categories?from=2027-01&to=2027-03")).status,
    ).toBe(401);
    const bad = (q: string) => ctx.ana.get(`/api/analytics/categories?${q}`);
    expect((await bad("")).status).toBe(400);
    expect((await bad("from=2027-13&to=2027-03")).status).toBe(400);
    expect((await bad("from=2027-03&to=2027-01")).status).toBe(400); // from after to
    expect((await bad("from=2027-01&to=2027-04")).status).toBe(400); // to after the current month
    expect((await bad("from=2025-01&to=2027-03")).status).toBe(400); // outside the window
    expect((await bad("from=2026-03&to=2027-03")).status).toBe(400); // 13 months
    expect((await bad("from=2026-04&to=2027-03")).status).toBe(200); // 12 months
  });

  it("sums confirmed household expenses per month, net of refunds in the expense's month", async () => {
    const other = await prisma.category.create({ data: { name: "Lazer" } });
    const jan = await tx({ type: "expense", amount: "100.00", transactionDate: "2027-01-10" });
    await tx({ type: "expense", amount: "50.00", transactionDate: "2027-03-02" });
    await tx({
      type: "expense",
      amount: "30.00",
      categoryId: other.id,
      transactionDate: "2027-03-03",
    });
    // The refund is dated in March but belongs to January.
    await tx({
      type: "refund",
      amount: "20.00",
      relatedTransactionId: jan.body.id,
      transactionDate: "2027-03-04",
    });
    // Personal, voided and out-of-range rows do not count.
    await tx({
      type: "expense",
      amount: "999.00",
      scope: "personal",
      ownerId: ctx.anaId,
      transactionDate: "2027-02-05",
    });
    const v = await tx({ type: "expense", amount: "888.00", transactionDate: "2027-02-06" });
    await send(ctx.ana, "post", `/api/transactions/${v.body.id}/void`, { reason: "x" });
    await tx({ type: "expense", amount: "77.00", transactionDate: "2026-12-31" });

    const t = await trends();
    expect(t.overall.points.map((p) => p.month)).toEqual(["2027-01", "2027-02", "2027-03"]);
    expect(amounts(t.overall)).toEqual(["80.00", "0.00", "80.00"]);
    const main = t.categories.find((c) => c.categoryId === ctx.categoryId)!;
    const lazer = t.categories.find((c) => c.categoryId === other.id)!;
    expect(amounts(main)).toEqual(["80.00", "0.00", "50.00"]);
    expect(amounts(lazer)).toEqual(["0.00", "0.00", "30.00"]);
  });

  it("flags the current month as partial", async () => {
    const t = await trends();
    expect(t.overall.points.map((p) => p.partial)).toEqual([false, false, true]);
  });

  it("lists uncategorized spending as categoryId null, and only categories that have data", async () => {
    await prisma.category.create({ data: { name: "Vazia" } });
    await prisma.transaction.create({
      data: {
        type: "expense",
        status: "confirmed",
        amount: "50.55",
        description: "old",
        transactionDate: new Date("2027-02-07T00:00:00Z"),
        scope: "household",
        payerId: ctx.anaId,
        createdById: ctx.anaId,
        updatedById: ctx.anaId,
      },
    });
    const t = await trends();
    expect(t.categories.map((c) => c.categoryId)).toEqual([null]);
    expect(amounts(t.categories[0]!)).toEqual(["0.00", "50.55", "0.00"]);
    expect(amounts(t.overall)).toEqual(["0.00", "50.55", "0.00"]);
  });

  it("shows the budget in force each month as a step, null before the first row", async () => {
    await tx({ type: "expense", amount: "10.00", transactionDate: "2027-01-10" });
    await editBudget(prisma, {
      categoryId: ctx.categoryId,
      period: "2027-02",
      amount: "120.00",
      mode: "going_forward",
    });
    await editBudget(prisma, {
      categoryId: ctx.categoryId,
      period: "2027-03",
      amount: "130.00",
      mode: "going_forward",
    });
    await editBudget(prisma, {
      categoryId: null,
      period: "2027-01",
      amount: "500.00",
      mode: "going_forward",
    });
    const t = await trends();
    const main = t.categories.find((c) => c.categoryId === ctx.categoryId)!;
    expect(main.points.map((p) => p.budget)).toEqual([null, "120.00", "130.00"]);
    expect(t.overall.points.map((p) => p.budget)).toEqual(["500.00", "500.00", "500.00"]);
  });

  it("keeps a category that has a budget but no spending, and gives null without any budget", async () => {
    await editBudget(prisma, {
      categoryId: ctx.categoryId,
      period: "2027-01",
      amount: "90.00",
      mode: "going_forward",
    });
    const t = await trends();
    const main = t.categories.find((c) => c.categoryId === ctx.categoryId)!;
    expect(amounts(main)).toEqual(["0.00", "0.00", "0.00"]);
    expect(main.points.map((p) => p.budget)).toEqual(["90.00", "90.00", "90.00"]);
    expect(t.overall.points.map((p) => p.budget)).toEqual([null, null, null]);
  });
});
