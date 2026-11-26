import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { personalHistorySchema } from "@spendual/shared";
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

describe("personal history", () => {
  it("carries the balance from month to month", async () => {
    const post = async (url: string, body: Record<string, unknown>) => {
      const res = await send(ctx.ana, "post", url, body);
      expect(res.status).toBe(201);
      return res.body as { id: number };
    };
    const personal = (ownerId: number, date: string, type: string, amount: string, extra = {}) =>
      post("/api/transactions", {
        type,
        amount,
        scope: "personal",
        ownerId,
        categoryId: type === "income" ? ctx.incomeCategoryId : ctx.categoryId,
        transactionDate: date,
        description: "x",
        ...extra,
      });
    for (const month of ["2026-12", "2027-01", "2027-02", "2027-03"]) {
      await post("/api/allowances", { ownerId: ctx.anaId, month, amount: "500.00" });
    }
    await personal(ctx.anaId, "2027-02-10", "expense", "800.00");
    const lunch = await personal(ctx.anaId, "2027-03-02", "expense", "200.00");
    await personal(ctx.anaId, "2027-03-03", "refund", "50.00", { relatedTransactionId: lunch.id });
    await personal(ctx.anaId, "2027-03-04", "income", "100.00");
    await post("/api/transactions", {
      type: "expense",
      amount: "300.00",
      scope: "household",
      categoryId: ctx.categoryId,
      transactionDate: "2027-03-05",
      description: "casa",
    });
    await personal(ctx.betoId, "2027-03-06", "expense", "999.00");

    const history = async (userId: number, from = "2026-12", to = "2027-03") =>
      personalHistorySchema.parse(
        (await ctx.ana.get(`/api/personal/history?userId=${userId}&from=${from}&to=${to}`)).body,
      );

    const ana = await history(ctx.anaId);
    expect(ana.points.map((p) => [p.month, p.opening, p.closing, p.partial])).toEqual([
      ["2026-12", "0.00", "500.00", false],
      ["2027-01", "500.00", "1000.00", false],
      ["2027-02", "1000.00", "700.00", false],
      ["2027-03", "700.00", "1150.00", true],
    ]);
    expect(ana.points[2]).toMatchObject({ allowance: "500.00", credits: "0.00", spent: "800.00" });
    expect(ana.points[3]).toMatchObject({
      allowance: "500.00",
      credits: "100.00",
      spent: "150.00",
    });

    // Beto has no allowance: the first months are left out and the balance goes below zero.
    const beto = await history(ctx.betoId);
    expect(beto.points).toHaveLength(1);
    expect(beto.points[0]).toMatchObject({ month: "2027-03", opening: "0.00", closing: "-999.00" });

    // A later start still carries the earlier history into the first bar.
    const short = await history(ctx.anaId, "2027-02", "2027-03");
    expect(short.points[0]).toMatchObject({ month: "2027-02", opening: "1000.00" });

    const get = (q: string) => ctx.ana.get(`/api/personal/history?${q}`);
    expect((await get(`userId=${ctx.anaId}&from=2027-03&to=2027-02`)).status).toBe(400);
    expect((await get(`userId=${ctx.anaId}&from=2027-03&to=2027-04`)).status).toBe(400);
    expect((await get(`userId=${ctx.anaId}&from=2024-01&to=2027-03`)).status).toBe(400);
    expect((await get(`userId=${ctx.anaId}&from=2025-01&to=2027-03`)).status).toBe(400);
    expect((await get(`userId=9999&from=2027-01&to=2027-03`)).status).toBe(400);
    expect((await get(`from=2027-01&to=2027-03`)).status).toBe(400);
  }, 120_000);
});
