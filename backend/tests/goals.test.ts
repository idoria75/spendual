import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { dashboardSchema, goalEntryListSchema, goalListSchema, goalSchema } from "@spendual/shared";
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

const M = "2027-03";
const D = `${M}-10`;
const dash = async (month = M) => {
  const res = await ctx.ana.get(`/api/dashboard?month=${month}`);
  expect(res.status).toBe(200);
  return dashboardSchema.parse(res.body);
};
const tx = (body: Record<string, unknown>) =>
  send(ctx.ana, "post", "/api/transactions", {
    scope: "household",
    categoryId: ctx.categoryId,
    transactionDate: `${M}-05`,
    description: "x",
    ...body,
  });
const newGoal = async (name: string, extra: Record<string, unknown> = {}) => {
  const res = await send(ctx.ana, "post", "/api/goals", { name, ...extra });
  expect(res.status).toBe(201);
  return goalSchema.parse(res.body);
};
const move = (id: number, kind: "allocations" | "withdrawals", amount: string, agent = ctx.ana) =>
  send(agent, "post", `/api/goals/${id}/${kind}`, { amount, effectiveDate: D });
const act = (id: number, name: string, agent = ctx.ana) =>
  send(agent, "post", `/api/goals/${id}/${name}`);

describe("goals", () => {
  it("follows the guide section 7 example and keeps goals out of income and expense", async () => {
    const income = await tx({
      type: "income",
      amount: "10000.00",
      categoryId: ctx.incomeCategoryId,
    });
    expect(income.status).toBe(201);
    expect((await tx({ type: "expense", amount: "5000.00" })).status).toBe(201);
    expect(
      (
        await send(ctx.ana, "post", "/api/allowances", {
          ownerId: ctx.anaId,
          month: M,
          amount: "2000.00",
        })
      ).status,
    ).toBe(201);
    const before = await dash();
    expect(before.savingsBeforeGoals).toBe("3000.00");
    expect(before.unallocatedSavings).toBe("3000.00");

    const trip = await newGoal("Viagem", { targetAmount: "5000.00" });
    const wedding = await newGoal("Casamento");
    expect(trip.balance).toBe("0.00");
    expect(wedding.targetAmount).toBeNull();
    expect((await move(trip.id, "allocations", "1000.00")).body.balance).toBe("1000.00");
    expect((await move(wedding.id, "allocations", "500.00", ctx.beto)).body.balance).toBe("500.00");

    const d = await dash();
    expect(d.goalAllocationsNet).toBe("1500.00");
    expect(d.unallocatedSavings).toBe("1500.00");
    expect(d.householdIncome).toBe("10000.00");
    expect(d.sharedExpensesNet).toBe("5000.00");
    expect(d.savingsBeforeGoals).toBe("3000.00");
    // Unallocated plus goals is the combined total.
    const goals = goalListSchema.parse((await ctx.ana.get("/api/goals")).body).items;
    const inGoals = goals.reduce((s, g) => s + Number(g.balance), 0);
    expect(Number(d.unallocatedSavings) + inGoals).toBe(3000);
    // Another month is not touched.
    expect((await dash("2027-04")).goalAllocationsNet).toBe("0.00");

    // Withdrawal: over the balance fails, within it returns money to unallocated.
    const over = await move(trip.id, "withdrawals", "1000.01");
    expect(over.status).toBe(409);
    expect(over.body.error.code).toBe("insufficient_balance");
    expect((await move(trip.id, "withdrawals", "400.00")).body.balance).toBe("600.00");
    expect((await dash()).unallocatedSavings).toBe("1900.00");

    // Entries are listed with actors.
    const entries = goalEntryListSchema.parse(
      (await ctx.ana.get(`/api/goals/${wedding.id}/entries`)).body,
    ).items;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: "ALLOCATION", actorId: ctx.betoId, amount: "500.00" });

    // Audit rows exist, with the actor.
    const audits = await prisma.auditEvent.findMany({ where: { entityType: "SavingsGoal" } });
    expect(audits.map((a) => a.action)).toContain("goal.withdraw");
    expect(audits.every((a) => a.actorId > 0)).toBe(true);

    // Goals add no transaction and no analytics.
    expect(await prisma.transaction.count()).toBe(2);
    const trends = await ctx.ana.get(`/api/analytics/categories?from=${M}&to=${M}`);
    expect(trends.body.overall.points[0].amount).toBe("5000.00");
  });

  it("allows only one of two parallel withdrawals", async () => {
    const g = await newGoal("Reserva");
    await move(g.id, "allocations", "100.00");
    const [a, b] = await Promise.all([
      move(g.id, "withdrawals", "80.00", ctx.ana),
      move(g.id, "withdrawals", "80.00", ctx.beto),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const list = goalListSchema.parse((await ctx.ana.get("/api/goals")).body).items;
    expect(list[0]!.balance).toBe("20.00");
  });

  it("closes only at zero, reopens, and treats archived as final", async () => {
    const g = await newGoal("Casa");
    await move(g.id, "allocations", "50.00");
    const blocked = await act(g.id, "complete");
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("goal_has_balance");
    expect((await act(g.id, "archive")).body.error.code).toBe("goal_has_balance");
    expect((await act(g.id, "reopen")).status).toBe(409); // still active

    await move(g.id, "withdrawals", "50.00");
    const done = await act(g.id, "complete", ctx.beto);
    expect(done.body.status).toBe("completed");
    expect((await move(g.id, "allocations", "1.00")).body.error.code).toBe("invalid_state");
    const patched = await send(ctx.ana, "patch", `/api/goals/${g.id}`, {
      name: "Casa nova",
      targetAmount: null,
    });
    expect(patched.body.name).toBe("Casa nova");

    expect((await act(g.id, "reopen")).body.status).toBe("active");
    expect((await move(g.id, "allocations", "5.00")).status).toBe(201);
    await move(g.id, "withdrawals", "5.00");
    expect((await act(g.id, "archive")).body.status).toBe("archived");

    for (const r of [
      await move(g.id, "allocations", "1.00"),
      await move(g.id, "withdrawals", "1.00"),
      await act(g.id, "complete"),
      await act(g.id, "reopen"),
      await act(g.id, "archive"),
      await send(ctx.ana, "patch", `/api/goals/${g.id}`, { name: "x" }),
    ]) {
      expect(r.status).toBe(409);
      expect(r.body.error.code).toBe("invalid_state");
    }
    // History stays readable.
    expect((await ctx.ana.get(`/api/goals/${g.id}/entries`)).body.items).toHaveLength(4);
    expect((await ctx.ana.get("/api/goals/9999/entries")).status).toBe(404);
  });

  it("validates input", async () => {
    const g = await newGoal("Teste");
    expect((await send(ctx.ana, "post", "/api/goals", { name: " " })).status).toBe(400);
    expect((await move(g.id, "allocations", "0.00")).status).toBe(400);
    const far = await send(ctx.ana, "post", `/api/goals/${g.id}/allocations`, {
      amount: "1.00",
      effectiveDate: "2035-01-01",
    });
    expect(far.status).toBe(400);
    expect((await send(ctx.ana, "patch", `/api/goals/${g.id}`, {})).status).toBe(400);
  });
});
