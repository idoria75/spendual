import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { duplicateGroupsSchema, transactionListSchema, transactionSchema } from "@spendual/shared";
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

describe("duplicates and corrections", () => {
  it("finds similar records, groups duplicates and corrects a record in one step", async () => {
    const body = (date: string, description: string, extra: Record<string, unknown> = {}) => ({
      type: "expense",
      amount: "42.00",
      scope: "household",
      categoryId: ctx.categoryId,
      transactionDate: date,
      description,
      ...extra,
    });
    const make = async (date: string, description: string, extra = {}) => {
      const res = await send(ctx.ana, "post", "/api/transactions", body(date, description, extra));
      expect(res.status).toBe(201);
      return transactionSchema.parse(res.body);
    };
    const first = await make("2027-03-05", "Pão Francês");
    const twin = await make("2027-03-07", "  pao  frances ");
    await make("2027-03-20", "Pão Francês"); // too far from the other two
    await make("2027-03-06", "Pão Francês", { amount: "43.00" }); // other amount
    await make("2027-03-06", "Pão Francês", { scope: "personal", ownerId: ctx.anaId });

    const similar = async (q: string) =>
      transactionListSchema.parse((await ctx.ana.get(`/api/transactions/similar?${q}`)).body);
    const base = "type=expense&amount=42.00&scope=household&description=P%C3%A3o+franc%C3%AAs";
    expect(
      (await similar(`${base}&transactionDate=2027-03-06`)).items.map((t) => t.id).sort(),
    ).toEqual([first.id, twin.id].sort());
    expect((await similar(`${base}&transactionDate=2027-04-10`)).items).toEqual([]);
    expect((await ctx.ana.get("/api/transactions/similar?type=expense")).status).toBe(400);

    const groups = duplicateGroupsSchema.parse(
      (await ctx.ana.get("/api/transactions/duplicates?month=2027-03")).body,
    );
    expect(groups.groups).toHaveLength(1);
    expect(groups.groups[0]?.items.map((t) => t.id)).toEqual([twin.id, first.id]);

    // Correction: the twin was a mistake, the right record has another amount and date.
    const fixed = await send(
      ctx.beto,
      "post",
      `/api/transactions/${twin.id}/correct`,
      body("2027-03-08", "Pão francês", { amount: "24.00" }),
    );
    expect(fixed.status).toBe(201);
    const created = transactionSchema.parse(fixed.body);
    expect(created).toMatchObject({
      status: "confirmed",
      amount: "24.00",
      createdById: ctx.betoId,
    });
    const old = transactionSchema.parse((await ctx.ana.get(`/api/transactions/${twin.id}`)).body);
    expect(old).toMatchObject({ status: "voided", voidReason: `Corrigido (#${created.id})` });
    const events = await prisma.auditEvent.findMany({
      where: { entityType: "Transaction", entityId: { in: [String(twin.id), String(created.id)] } },
      orderBy: { id: "asc" },
    });
    expect(events.map((e) => [e.entityId, e.action, e.reason])).toEqual([
      [String(twin.id), "transaction.create", null],
      [String(twin.id), "transaction.correct", "Corrigido"],
      [String(created.id), "transaction.create", `Corrige #${twin.id}`],
    ]);
    const after = duplicateGroupsSchema.parse(
      (await ctx.ana.get("/api/transactions/duplicates?month=2027-03")).body,
    );
    expect(after.groups).toHaveLength(0);

    // A second correction of the same (now voided) record, and bad input, change nothing.
    const again = await send(
      ctx.ana,
      "post",
      `/api/transactions/${twin.id}/correct`,
      body("2027-03-08", "x"),
    );
    expect(again.status).toBe(409);
    const bad = await send(ctx.ana, "post", `/api/transactions/${first.id}/correct`, {
      type: "expense",
    });
    expect(bad.status).toBe(400);
    expect(
      transactionSchema.parse((await ctx.ana.get(`/api/transactions/${first.id}`)).body).status,
    ).toBe("confirmed");
    expect(await prisma.transaction.count()).toBe(6);

    // An expense with a confirmed refund cannot be corrected, and nothing is created.
    const refund = await send(ctx.ana, "post", "/api/transactions", {
      type: "refund",
      amount: "10.00",
      scope: "household",
      categoryId: ctx.categoryId,
      transactionDate: "2027-03-09",
      description: "Estorno",
      relatedTransactionId: first.id,
    });
    expect(refund.status).toBe(201);
    const blocked = await send(
      ctx.ana,
      "post",
      `/api/transactions/${first.id}/correct`,
      body("2027-03-05", "Pão"),
    );
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("has_refunds");
    expect(await prisma.transaction.count()).toBe(7);
  }, 120_000);
});
