import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { dashboardSchema } from "@spendual/shared";
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

describe("spending pace", () => {
  it("compares the current month so far with the same days of last month", async () => {
    const spend = async (date: string, amount: string, extra: Record<string, unknown> = {}) => {
      const res = await send(ctx.ana, "post", "/api/transactions", {
        type: "expense",
        amount,
        scope: "household",
        categoryId: ctx.categoryId,
        transactionDate: date,
        description: "x",
        ...extra,
      });
      expect(res.status).toBe(201);
    };
    await spend("2027-02-05", "100.00");
    await spend("2027-02-20", "300.00");
    await spend("2027-02-01", "1000.00", { scope: "personal", ownerId: ctx.anaId });
    await spend("2027-03-05", "50.00");
    await spend("2027-03-20", "999.00");

    const dash = async (month: string) =>
      dashboardSchema.parse((await ctx.ana.get(`/api/dashboard?month=${month}`)).body);
    expect((await dash("2027-03")).pace).toEqual({
      day: 15,
      spent: "50.00",
      lastMonthSameDays: "100.00",
      lastMonthTotal: "400.00",
    });
    expect((await dash("2027-02")).pace).toBeNull();
    expect((await dash("2027-04")).pace).toBeNull();
  }, 60_000);
});
