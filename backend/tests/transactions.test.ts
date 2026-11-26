import type { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditEventListSchema, transactionListSchema, transactionSchema } from "@spendual/shared";
import { makeApp } from "./helpers/authApp.js";
import { resetDb, testPrisma } from "./helpers/testDb.js";
import { send, setup, type Ctx } from "./helpers/txApp.js";

/** Create events are covered in audit.test.ts; these tests look at the change events only. */
const NOT_CREATE = { action: { not: "transaction.create" } };

let prisma: PrismaClient;
let ctx: Ctx;
beforeAll(() => {
  prisma = testPrisma();
});
afterAll(() => prisma.$disconnect());
beforeEach(async () => {
  await resetDb(prisma);
  ctx = await setup(prisma);
});

const expense = (over: Record<string, unknown> = {}) => ({
  type: "expense",
  amount: "100.00",
  description: "Feira",
  transactionDate: "2026-10-05",
  scope: "household",
  categoryId: ctx.categoryId,
  ...over,
});

const create = (body: Record<string, unknown>, agent = ctx.ana) =>
  send(agent, "post", "/api/transactions", body);

async function makeExpense(over: Record<string, unknown> = {}) {
  const res = await create(expense(over));
  expect(res.status).toBe(201);
  return res.body.id as number;
}

const refundOf = (id: number, amount: string, over: Record<string, unknown> = {}) =>
  create({
    type: "refund",
    amount,
    description: "Estorno",
    transactionDate: "2026-10-06",
    scope: "household",
    relatedTransactionId: id,
    ...over,
  });

describe("auth", () => {
  it("returns 401 without a session", async () => {
    const app = makeApp(prisma);
    expect((await request(app).get("/api/transactions?month=2026-10")).status).toBe(401);
    expect((await request(app).get("/api/transactions/1")).status).toBe(401);
    expect((await request(app).get("/api/transactions/1/audit")).status).toBe(401);
  });

  it("returns 403 without the CSRF token on every write", async () => {
    const id = await makeExpense();
    for (const [method, url] of [
      ["post", "/api/transactions"],
      ["patch", `/api/transactions/${id}`],
      ["post", `/api/transactions/${id}/void`],
      ["post", `/api/transactions/${id}/cancel`],
    ] as const) {
      const res = await ctx.ana[method](url).send({ reason: "x" });
      expect(res.status, url).toBe(403);
    }
  });
});

describe("create: type and scope combos", () => {
  it("creates a household expense, defaulting payer to the signed-in user", async () => {
    const res = await create(expense());
    expect(res.status).toBe(201);
    const t = transactionSchema.parse(res.body);
    expect(t).toMatchObject({
      type: "expense",
      status: "confirmed",
      amount: "100.00",
      currency: "BRL",
      transactionDate: "2026-10-05",
      scope: "household",
      ownerId: null,
      payerId: ctx.anaId,
      createdById: ctx.anaId,
      updatedById: ctx.anaId,
    });
  });

  it("creates a personal expense with owner and another payer", async () => {
    const res = await create(
      expense({ scope: "personal", ownerId: ctx.betoId, payerId: ctx.anaId }),
    );
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ scope: "personal", ownerId: ctx.betoId });
  });

  it.each([
    ["personal without owner", { scope: "personal" }],
    ["household with owner", { scope: "household", ownerId: 1 }],
    ["expense without category", { categoryId: null }],
    ["zero amount", { amount: "0.00" }],
    ["negative amount", { amount: "-5.00" }],
    ["amount with one decimal", { amount: "5.0" }],
    ["bad date", { transactionDate: "2026-02-30" }],
    ["empty description", { description: "  " }],
    ["unknown type", { type: "gift" }],
    ["link on non-refund", { relatedTransactionId: 1 }],
    ["unknown category", { categoryId: 99999 }],
    ["unknown payer", { payerId: 99999 }],
    ["unknown account", { accountId: 99999 }],
    ["unknown payment method", { paymentMethodId: 99999 }],
    ["unknown owner", { scope: "personal", ownerId: 99999 }],
  ])("rejects %s with 400", async (_name, over) => {
    const res = await create(expense(over));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("validation_error");
  });

  it("creates income and other_receipt with or without category", async () => {
    for (const type of ["income", "other_receipt"]) {
      const bare = await create({
        type,
        amount: "10.00",
        description: "x",
        transactionDate: "2026-10-01",
        scope: "personal",
        ownerId: ctx.anaId,
      });
      expect(bare.status).toBe(201);
      const withCat = await create({
        type,
        amount: "10.00",
        description: "x",
        transactionDate: "2026-10-01",
        scope: "household",
        categoryId: ctx.incomeCategoryId,
      });
      expect(withCat.status).toBe(201);
    }
  });

  it("creates a transfer with an account and rejects one without, or with a category", async () => {
    const base = {
      type: "transfer",
      amount: "50.00",
      description: "Mover",
      transactionDate: "2026-10-02",
      scope: "household",
    };
    expect((await create({ ...base, accountId: ctx.accountId })).status).toBe(201);
    expect((await create(base)).status).toBe(400);
    expect(
      (await create({ ...base, accountId: ctx.accountId, categoryId: ctx.categoryId })).status,
    ).toBe(400);
  });

  it("rejects archived catalog items and inactive users", async () => {
    await prisma.category.update({ where: { id: ctx.categoryId }, data: { active: false } });
    await prisma.account.update({ where: { id: ctx.accountId }, data: { active: false } });
    await prisma.paymentMethod.update({
      where: { id: ctx.paymentMethodId },
      data: { active: false },
    });
    expect((await create(expense())).status).toBe(400);
    const cat = await prisma.category.create({ data: { name: "Ativa" } });
    expect((await create(expense({ categoryId: cat.id, accountId: ctx.accountId }))).status).toBe(
      400,
    );
    expect(
      (await create(expense({ categoryId: cat.id, paymentMethodId: ctx.paymentMethodId }))).status,
    ).toBe(400);
    await prisma.user.update({ where: { id: ctx.betoId }, data: { active: false } });
    expect((await create(expense({ categoryId: cat.id, payerId: ctx.betoId }))).status).toBe(400);
    expect(
      (await create(expense({ categoryId: cat.id, scope: "personal", ownerId: ctx.betoId })))
        .status,
    ).toBe(400);
  });

  it("rejects an invalid JSON body", async () => {
    const token = (await ctx.ana.get("/api/auth/csrf")).body.csrfToken as string;
    const res = await ctx.ana
      .post("/api/transactions")
      .set("X-CSRF-Token", token)
      .set("Content-Type", "application/json")
      .send("{bad");
    expect(res.status).toBe(400);
  });
});

describe("money", () => {
  it("serializes amounts as two-place strings and never as numbers", async () => {
    const id = await makeExpense({ amount: "1234567890.50" });
    const res = await ctx.ana.get(`/api/transactions/${id}`);
    expect(res.body.amount).toBe("1234567890.50");
    expect(res.text).toContain('"amount":"1234567890.50"');
    const small = await makeExpense({ amount: "0.10" });
    expect((await ctx.ana.get(`/api/transactions/${small}`)).body.amount).toBe("0.10");
  });

  it("keeps exact cents in sums (no float drift)", async () => {
    const id = await makeExpense({ amount: "0.30" });
    expect((await refundOf(id, "0.10")).status).toBe(201);
    expect((await refundOf(id, "0.20")).status).toBe(201);
    expect((await refundOf(id, "0.01")).status).toBe(409);
  });
});

describe("refunds", () => {
  it("links to a confirmed expense and stops at the expense amount", async () => {
    const id = await makeExpense({ amount: "100.00" });
    const r1 = await refundOf(id, "60.00");
    expect(r1.status).toBe(201);
    expect(r1.body.relatedTransactionId).toBe(id);
    const r2 = await refundOf(id, "40.01");
    expect(r2.status).toBe(409);
    expect(r2.body.error.code).toBe("refund_exceeds");
    expect((await refundOf(id, "40.00")).status).toBe(201);
    expect((await refundOf(id, "0.01")).status).toBe(409);
  });

  it("requires the link and rejects missing or non-expense targets", async () => {
    const body = {
      type: "refund",
      amount: "1.00",
      description: "r",
      transactionDate: "2026-10-06",
      scope: "household",
    };
    expect((await create(body)).status).toBe(400);
    expect((await refundOf(99999, "1.00")).status).toBe(400);
    const income = await create({ ...body, type: "income" });
    expect((await refundOf(income.body.id, "1.00")).status).toBe(400);
  });

  it("rejects a refund of a voided expense", async () => {
    const id = await makeExpense();
    await send(ctx.ana, "post", `/api/transactions/${id}/void`, { reason: "erro" });
    expect((await refundOf(id, "1.00")).status).toBe(400);
  });

  it("does not count voided refunds", async () => {
    const id = await makeExpense({ amount: "100.00" });
    const r = await refundOf(id, "100.00");
    await send(ctx.ana, "post", `/api/transactions/${r.body.id}/void`, { reason: "erro" });
    expect((await refundOf(id, "100.00")).status).toBe(201);
  });

  it("concurrent refunds cannot pass the expense amount", async () => {
    const id = await makeExpense({ amount: "100.00" });
    const results = await Promise.all(
      Array.from({ length: 4 }, (_, i) => refundOf(id, "40.00", { description: `r${i}` })),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(2);
    expect(results.filter((r) => r.status === 409)).toHaveLength(2);
  });

  it("voiding an expense with confirmed refunds gives 409 has_refunds", async () => {
    const id = await makeExpense();
    const r = await refundOf(id, "10.00");
    const res = await send(ctx.ana, "post", `/api/transactions/${id}/void`, { reason: "erro" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("has_refunds");
    await send(ctx.ana, "post", `/api/transactions/${r.body.id}/void`, { reason: "erro" });
    expect(
      (await send(ctx.ana, "post", `/api/transactions/${id}/void`, { reason: "erro" })).status,
    ).toBe(200);
  });

  it("blocks lowering an expense below its refunds, and raising a refund above it", async () => {
    const id = await makeExpense({ amount: "100.00" });
    const r = await refundOf(id, "60.00");
    const low = await send(ctx.ana, "patch", `/api/transactions/${id}`, { amount: "59.99" });
    expect(low.status).toBe(409);
    expect(low.body.error.code).toBe("refund_exceeds");
    expect(
      (await send(ctx.ana, "patch", `/api/transactions/${id}`, { amount: "60.00" })).status,
    ).toBe(200);
    const high = await send(ctx.ana, "patch", `/api/transactions/${r.body.id}`, {
      amount: "60.01",
    });
    expect(high.status).toBe(409);
  });
});

describe("patch", () => {
  it("changes allowed fields and writes one audit row with before and after", async () => {
    const id = await makeExpense();
    const res = await send(ctx.beto, "patch", `/api/transactions/${id}`, {
      amount: "120.50",
      description: "Feira grande",
      transactionDate: "2026-10-07",
      notes: "ok",
      paymentMethodId: ctx.paymentMethodId,
      accountId: ctx.accountId,
      payerId: ctx.betoId,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      amount: "120.50",
      description: "Feira grande",
      transactionDate: "2026-10-07",
      notes: "ok",
      payerId: ctx.betoId,
      updatedById: ctx.betoId,
      createdById: ctx.anaId,
    });
    const rows = await prisma.auditEvent.findMany({ where: NOT_CREATE });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorId: ctx.betoId,
      entityType: "Transaction",
      entityId: String(id),
      action: "transaction.update",
      reason: null,
    });
    expect((rows[0]?.before as { amount: string }).amount).toBe("100.00");
    expect((rows[0]?.after as { amount: string }).amount).toBe("120.50");
  });

  it("ignores or rejects fields that never change", async () => {
    const id = await makeExpense();
    for (const body of [{ type: "income" }, { scope: "personal" }, { ownerId: 1 }, {}]) {
      const res = await send(ctx.ana, "patch", `/api/transactions/${id}`, body);
      // Zod strips unknown keys, so only the empty result is an error.
      expect([200, 400]).toContain(res.status);
    }
    const t = (await ctx.ana.get(`/api/transactions/${id}`)).body;
    expect(t).toMatchObject({ type: "expense", scope: "household", ownerId: null });
  });

  it("rejects clearing the category of an expense, and bad transfer edits", async () => {
    const id = await makeExpense();
    expect(
      (await send(ctx.ana, "patch", `/api/transactions/${id}`, { categoryId: null })).status,
    ).toBe(400);
    const tr = await create({
      type: "transfer",
      amount: "5.00",
      description: "t",
      transactionDate: "2026-10-02",
      scope: "household",
      accountId: ctx.accountId,
    });
    const path = `/api/transactions/${tr.body.id}`;
    expect((await send(ctx.ana, "patch", path, { accountId: null })).status).toBe(400);
    expect((await send(ctx.ana, "patch", path, { categoryId: ctx.categoryId })).status).toBe(400);
  });

  it("rejects newly chosen archived items but allows keeping an old archived one", async () => {
    const id = await makeExpense();
    const other = await prisma.category.create({ data: { name: "Outra", active: false } });
    expect(
      (await send(ctx.ana, "patch", `/api/transactions/${id}`, { categoryId: other.id })).status,
    ).toBe(400);
    await prisma.category.update({ where: { id: ctx.categoryId }, data: { active: false } });
    const res = await send(ctx.ana, "patch", `/api/transactions/${id}`, {
      categoryId: ctx.categoryId,
      description: "Novo",
    });
    expect(res.status).toBe(200);
  });

  it("returns 404, 400 and 409 for missing, bad id and wrong status", async () => {
    expect((await send(ctx.ana, "patch", "/api/transactions/99999", { notes: "x" })).status).toBe(
      404,
    );
    expect((await send(ctx.ana, "patch", "/api/transactions/abc", { notes: "x" })).status).toBe(
      400,
    );
    const id = await makeExpense();
    await send(ctx.ana, "post", `/api/transactions/${id}/void`, { reason: "erro" });
    const res = await send(ctx.ana, "patch", `/api/transactions/${id}`, { notes: "x" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("invalid_state");
  });
});

describe("void and cancel", () => {
  it("void needs a reason", async () => {
    const id = await makeExpense();
    for (const body of [{}, { reason: "" }, { reason: "   " }]) {
      const res = await send(ctx.ana, "post", `/api/transactions/${id}/void`, body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("validation_error");
    }
    expect(await prisma.auditEvent.count({ where: NOT_CREATE })).toBe(0);
  });

  it("void sets status and reason and writes an audit row", async () => {
    const id = await makeExpense();
    const res = await send(ctx.beto, "post", `/api/transactions/${id}/void`, { reason: " erro " });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: "voided",
      voidReason: "erro",
      updatedById: ctx.betoId,
    });
    const rows = await prisma.auditEvent.findMany({ where: NOT_CREATE });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: "transaction.void",
      reason: "erro",
      actorId: ctx.betoId,
    });
    expect((rows[0]?.before as { status: string }).status).toBe("confirmed");
    expect((rows[0]?.after as { status: string }).status).toBe("voided");
  });

  it("void on a missing, voided or planned row gives 404 or 409 invalid_state", async () => {
    expect(
      (await send(ctx.ana, "post", "/api/transactions/99999/void", { reason: "x" })).status,
    ).toBe(404);
    const id = await makeExpense();
    await send(ctx.ana, "post", `/api/transactions/${id}/void`, { reason: "x" });
    const again = await send(ctx.ana, "post", `/api/transactions/${id}/void`, { reason: "x" });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("invalid_state");
    const planned = await plannedRow();
    const res = await send(ctx.ana, "post", `/api/transactions/${planned}/void`, { reason: "x" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("invalid_state");
  });

  async function plannedRow(): Promise<number> {
    const row = await prisma.transaction.create({
      data: {
        type: "expense",
        status: "planned",
        amount: "30.00",
        description: "Conta",
        transactionDate: new Date("2026-10-20T00:00:00.000Z"),
        scope: "household",
        categoryId: ctx.categoryId,
        createdById: ctx.anaId,
        updatedById: ctx.anaId,
      },
    });
    return row.id;
  }

  it("cancel works on planned rows only, with a reason", async () => {
    const planned = await plannedRow();
    const url = `/api/transactions/${planned}/cancel`;
    expect((await send(ctx.ana, "post", url, {})).status).toBe(400);
    const res = await send(ctx.ana, "post", url, { reason: "pago em dinheiro" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "cancelled", voidReason: "pago em dinheiro" });
    const rows = await prisma.auditEvent.findMany({ where: NOT_CREATE });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toBe("transaction.cancel");
    expect((await send(ctx.ana, "post", url, { reason: "x" })).status).toBe(409);
    const confirmed = await makeExpense();
    const wrong = await send(ctx.ana, "post", `/api/transactions/${confirmed}/cancel`, {
      reason: "x",
    });
    expect(wrong.status).toBe(409);
    expect(wrong.body.error.code).toBe("invalid_state");
  });

  it("concurrent double void gives one 200 and one 409, one audit row", async () => {
    const id = await makeExpense();
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        send(ctx.ana, "post", `/api/transactions/${id}/void`, { reason: "erro" }),
      ),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(4);
    expect(results.filter((r) => r.status === 500)).toHaveLength(0);
    expect(await prisma.auditEvent.count({ where: NOT_CREATE })).toBe(1);
  });
});

describe("get, list and audit", () => {
  it("get returns 404 for missing and 400 for a bad id", async () => {
    const miss = await ctx.ana.get("/api/transactions/99999");
    expect(miss.status).toBe(404);
    expect(miss.body.error.code).toBe("not_found");
    expect((await ctx.ana.get("/api/transactions/abc")).status).toBe(400);
    expect((await ctx.ana.get("/api/transactions/99999/audit")).status).toBe(404);
  });

  it("audit lists events newest first", async () => {
    const id = await makeExpense();
    await send(ctx.ana, "patch", `/api/transactions/${id}`, { notes: "a" });
    await send(ctx.ana, "post", `/api/transactions/${id}/void`, { reason: "erro" });
    const res = await ctx.ana.get(`/api/transactions/${id}/audit`);
    expect(res.status).toBe(200);
    const list = auditEventListSchema.parse(res.body);
    expect(list.items.map((e) => e.action)).toEqual([
      "transaction.void",
      "transaction.update",
      "transaction.create",
    ]);
    expect(list.items[0]?.reason).toBe("erro");
  });

  it("list needs a valid month", async () => {
    expect((await ctx.ana.get("/api/transactions")).status).toBe(400);
    expect((await ctx.ana.get("/api/transactions?month=2026-13")).status).toBe(400);
    expect((await ctx.ana.get("/api/transactions?month=2026-10&type=nope")).status).toBe(400);
  });

  it("filters by month, scope, person, category, type and status; newest first", async () => {
    const cat2 = await prisma.category.create({ data: { name: "Lazer" } });
    const a = await makeExpense({ transactionDate: "2026-10-01", description: "a" });
    const b = await makeExpense({
      transactionDate: "2026-10-31",
      description: "b",
      scope: "personal",
      ownerId: ctx.betoId,
      payerId: ctx.anaId,
      categoryId: cat2.id,
    });
    const c = await makeExpense({ transactionDate: "2026-11-01", description: "c" });
    const d = await makeExpense({ transactionDate: "2026-09-30", description: "d" });
    const e = await makeExpense({ transactionDate: "2026-10-31", description: "e" });
    await send(ctx.ana, "post", `/api/transactions/${e}/void`, { reason: "erro" });
    await prisma.transaction.create({
      data: {
        type: "expense",
        status: "planned",
        amount: "1.00",
        description: "p",
        transactionDate: new Date("2026-10-15T00:00:00.000Z"),
        scope: "household",
        createdById: ctx.anaId,
        updatedById: ctx.anaId,
      },
    });
    const ids = async (qs: string) => {
      const res = await ctx.ana.get(`/api/transactions?${qs}`);
      expect(res.status).toBe(200);
      return transactionListSchema.parse(res.body).items.map((t) => t.id);
    };
    expect(await ids("month=2026-10")).toEqual([e, b, a]);
    expect(await ids("month=2026-11")).toEqual([c]);
    expect(await ids("month=2026-09")).toEqual([d]);
    expect(await ids("month=2026-10&scope=personal")).toEqual([b]);
    expect(await ids("month=2026-10&scope=household")).toEqual([e, a]);
    // Personal: owner counts. Household: payer counts.
    expect(await ids(`month=2026-10&personId=${ctx.betoId}`)).toEqual([b]);
    expect(await ids(`month=2026-10&personId=${ctx.anaId}`)).toEqual([e, a]);
    expect(await ids(`month=2026-10&categoryId=${cat2.id}`)).toEqual([b]);
    expect(await ids("month=2026-10&type=income")).toEqual([]);
    expect(await ids("month=2026-10&status=voided")).toEqual([e]);
    expect(await ids("month=2026-10&status=confirmed")).toEqual([b, a]);
    expect(await ids("month=2026-10&status=planned")).toEqual([]);
  });
});

describe("category kind rules", () => {
  const post = (ctx0: Ctx, body: Record<string, unknown>) =>
    send(ctx0.ana, "post", "/api/transactions", {
      scope: "household",
      transactionDate: "2027-03-05",
      description: "x",
      amount: "10.00",
      ...body,
    });

  it("expense needs an expense category", async () => {
    const bad = await post(ctx, { type: "expense", categoryId: ctx.incomeCategoryId });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("validation_error");
    expect(bad.body.error.fields.categoryId).toBeDefined();
    const ok = await post(ctx, { type: "expense", categoryId: ctx.categoryId });
    expect(ok.status).toBe(201);
  });

  it("income and other_receipt take an income category or none", async () => {
    for (const type of ["income", "other_receipt"]) {
      const bad = await post(ctx, { type, categoryId: ctx.categoryId });
      expect(bad.status).toBe(400);
      expect(bad.body.error.fields.categoryId).toBeDefined();
      expect((await post(ctx, { type, categoryId: ctx.incomeCategoryId })).status).toBe(201);
      expect((await post(ctx, { type })).status).toBe(201);
    }
  });

  it("refund with a category needs an expense category", async () => {
    const e = await post(ctx, { type: "expense", categoryId: ctx.categoryId });
    const refund = { type: "refund", relatedTransactionId: e.body.id, amount: "5.00" };
    const bad = await post(ctx, { ...refund, categoryId: ctx.incomeCategoryId });
    expect(bad.status).toBe(400);
    expect(bad.body.error.fields.categoryId).toBeDefined();
    expect((await post(ctx, { ...refund, categoryId: ctx.categoryId })).status).toBe(201);
  });

  it("patch checks the kind of a new category", async () => {
    const e = await post(ctx, { type: "expense", categoryId: ctx.categoryId });
    const bad = await send(ctx.ana, "patch", `/api/transactions/${e.body.id}`, {
      categoryId: ctx.incomeCategoryId,
    });
    expect(bad.status).toBe(400);
    expect(bad.body.error.fields.categoryId).toBeDefined();
    const i = await post(ctx, { type: "income", categoryId: ctx.incomeCategoryId });
    const bad2 = await send(ctx.ana, "patch", `/api/transactions/${i.body.id}`, {
      categoryId: ctx.categoryId,
    });
    expect(bad2.status).toBe(400);
  });
});

describe("list: categories drill-down", () => {
  const list = async (query: string) => {
    const res = await ctx.ana.get(`/api/transactions?month=2026-10&${query}`);
    expect(res.status).toBe(200);
    return transactionListSchema.parse(res.body).items;
  };

  it("returns expenses and linked refunds of those categories", async () => {
    const other = await prisma.category.create({ data: { name: "Outra", kind: "expense" } });
    const food = await makeExpense({ amount: "100.00" });
    const away = await makeExpense({ amount: "40.00", categoryId: other.id });
    // A refund dated in the next month still belongs to its expense's month.
    const refund = await refundOf(food, "30.00", { transactionDate: "2026-11-02" });
    expect(refund.status).toBe(201);

    const items = await list(`categories=${ctx.categoryId}`);
    expect(items.map((t) => t.id).sort()).toEqual([food, refund.body.id].sort());
    const both = await list(`categories=${ctx.categoryId},${other.id}`);
    expect(both.map((t) => t.id)).toContain(away);
    expect(both).toHaveLength(3);
  });

  it("none returns records without a category", async () => {
    const id = await makeExpense();
    const loose = await makeExpense({ amount: "9.00" });
    await prisma.transaction.update({ where: { id: loose }, data: { categoryId: null } });
    expect((await list("categories=none")).map((t) => t.id)).toEqual([loose]);
    expect((await list(`categories=${ctx.categoryId},none`)).map((t) => t.id).sort()).toEqual(
      [id, loose].sort(),
    );
  });

  it("keeps scope and status filters", async () => {
    await makeExpense({ scope: "personal", ownerId: ctx.anaId });
    const kept = await makeExpense();
    const voided = await makeExpense({ amount: "5.00" });
    await send(ctx.ana, "post", `/api/transactions/${voided}/void`, { reason: "erro" });
    const items = await list(`categories=${ctx.categoryId}&scope=household&status=confirmed`);
    expect(items.map((t) => t.id)).toEqual([kept]);
  });

  it("rejects a bad list", async () => {
    for (const bad of ["abc", "", "3,,4", "3,x"]) {
      expect((await ctx.ana.get(`/api/transactions?month=2026-10&categories=${bad}`)).status).toBe(
        400,
      );
    }
    const many = Array.from({ length: 51 }, (_, i) => i + 1).join(",");
    expect((await ctx.ana.get(`/api/transactions?month=2026-10&categories=${many}`)).status).toBe(
      400,
    );
  });
});
