import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { budgetOverviewSchema, dashboardSchema } from "@spendual/shared";
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

describe("monthly savings target", () => {
  it("is kept apart from spending budgets and follows the month rules", async () => {
    const tx = (body: Record<string, unknown>) =>
      send(ctx.ana, "post", "/api/transactions", {
        scope: "household",
        transactionDate: "2027-03-05",
        description: "x",
        ...body,
      });
    expect(
      (await tx({ type: "income", amount: "10000.00", categoryId: ctx.incomeCategoryId })).status,
    ).toBe(201);
    expect(
      (await tx({ type: "expense", amount: "6000.00", categoryId: ctx.categoryId })).status,
    ).toBe(201);
    const put = (period: string, amount: string, mode: string, extra = {}) =>
      send(ctx.beto, "put", "/api/budgets", {
        categoryId: null,
        savings: true,
        period,
        amount,
        mode,
        ...extra,
      });
    const overview = async (month: string) =>
      budgetOverviewSchema.parse((await ctx.ana.get(`/api/budgets?month=${month}`)).body);
    const target = async (month: string) =>
      dashboardSchema.parse((await ctx.ana.get(`/api/dashboard?month=${month}`)).body)
        .savingsTarget;

    const none = await overview("2027-03");
    expect(none.savings).toEqual({ categoryId: null, amount: null, spent: "4000.00" });
    expect(await target("2027-03")).toBeNull();

    expect((await put("2027-03", "3000.00", "going_forward")).status).toBe(200);
    const set = await overview("2027-03");
    expect(set.savings.amount).toBe("3000.00");
    expect(set.overall.amount).toBeNull();
    expect(await target("2027-03")).toBe("3000.00");
    expect(await target("2027-05")).toBe("3000.00");
    expect(await target("2027-02")).toBeNull();
    const dash = dashboardSchema.parse((await ctx.ana.get("/api/dashboard?month=2027-03")).body);
    expect(dash.overallBudget.budget).toBeNull();
    expect(dash.savingsBeforeGoals).toBe("4000.00");

    expect((await put("2027-04", "5000.00", "this_period_only")).status).toBe(200);
    expect(await target("2027-04")).toBe("5000.00");
    expect(await target("2027-05")).toBe("3000.00");

    expect(
      (await put("2027-03", "1.00", "going_forward", { categoryId: ctx.categoryId })).status,
    ).toBe(400);
  }, 60_000);
});
