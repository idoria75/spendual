import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditLogSchema } from "@spendual/shared";
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

describe("audit log", () => {
  it("records every create, lists newest first, filters and pages", async () => {
    const tx = await send(ctx.ana, "post", "/api/transactions", {
      type: "expense",
      amount: "10.00",
      scope: "household",
      categoryId: ctx.categoryId,
      transactionDate: "2027-03-05",
      description: "Pão",
    });
    expect(tx.status).toBe(201);
    const rule = await send(ctx.beto, "post", "/api/recurrence-rules", {
      description: "Internet",
      expectedAmount: "100.00",
      dayOfMonth: 10,
      startDate: "2027-03-01",
      scope: "household",
      categoryId: ctx.categoryId,
    });
    expect(rule.status).toBe(201);
    const plan = await send(ctx.ana, "post", "/api/installment-plans", {
      description: "Sofá",
      totalAmount: "300.00",
      installmentCount: 3,
      firstDueDate: "2027-03-10",
      scope: "household",
      categoryId: ctx.categoryId,
    });
    expect(plan.status).toBe(201);
    const goal = await send(ctx.ana, "post", "/api/goals", { name: "Viagem" });
    expect(goal.status).toBe(201);
    const patched = await send(ctx.beto, "patch", `/api/transactions/${tx.body.id}`, {
      description: "Pão francês",
    });
    expect(patched.status).toBe(200);

    const all = auditLogSchema.parse((await ctx.ana.get("/api/audit")).body);
    expect(all.items.map((e) => e.action)).toEqual([
      "transaction.update",
      "goal.create",
      "plan.create",
      "rule.create",
      "transaction.create",
    ]);
    expect(all.nextBefore).toBeNull();
    expect(all.items[0]).toMatchObject({ actorId: ctx.betoId, entityType: "Transaction" });
    expect(all.items[0]?.before).toMatchObject({ description: "Pão" });
    expect(all.items[0]?.after).toMatchObject({ description: "Pão francês" });
    expect(all.items[3]).toMatchObject({ actorId: ctx.betoId, entityType: "RecurrenceRule" });

    const onlyTx = auditLogSchema.parse(
      (await ctx.ana.get("/api/audit?entityType=Transaction")).body,
    );
    expect(onlyTx.items.map((e) => e.action)).toEqual(["transaction.update", "transaction.create"]);

    const page1 = auditLogSchema.parse((await ctx.ana.get("/api/audit?limit=2")).body);
    expect(page1.items).toHaveLength(2);
    expect(page1.nextBefore).toBe(page1.items[1]?.id);
    const page2 = auditLogSchema.parse(
      (await ctx.ana.get(`/api/audit?limit=2&before=${page1.nextBefore}`)).body,
    );
    expect(page2.items.map((e) => e.action)).toEqual(["plan.create", "rule.create"]);
    expect(page2.nextBefore).toBe(page2.items[1]?.id);

    expect((await ctx.ana.get("/api/audit?limit=0")).status).toBe(400);
    expect((await ctx.ana.get("/api/audit?entityType=Nope")).status).toBe(400);
  }, 60_000);
});
