import type { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  billListSchema,
  billSchema,
  budgetOverviewSchema,
  dashboardSchema,
  installmentPlanDetailSchema,
  allowanceOverviewSchema,
  recurrenceRuleCreateSchema,
  recurrenceRuleSchema,
} from "@spendual/shared";
import { createRule } from "../src/services/bills.js";
import { currentPeriod } from "../src/lib/period.js";
import { csrfToken, makeApp } from "./helpers/authApp.js";
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
const dash = async (month = M, agent = ctx.ana) => {
  const res = await agent.get(`/api/dashboard?month=${month}`);
  expect(res.status).toBe(200);
  return dashboardSchema.parse(res.body);
};
const tx = (body: Record<string, unknown>) =>
  send(ctx.ana, "post", "/api/transactions", {
    scope: "household",
    categoryId:
      body.type === "income" || body.type === "other_receipt"
        ? ctx.incomeCategoryId
        : ctx.categoryId,
    transactionDate: `${M}-05`,
    description: "x",
    ...body,
  });
const rule = (over: Record<string, unknown> = {}) =>
  send(ctx.ana, "post", "/api/recurrence-rules", {
    description: "Aluguel",
    expectedAmount: "100.00",
    dayOfMonth: 10,
    startDate: `${M}-01`,
    scope: "household",
    categoryId: ctx.categoryId,
    ...over,
  });
const bills = async (month = M) => {
  const res = await ctx.ana.get(`/api/bills?month=${month}`);
  expect(res.status).toBe(200);
  return billListSchema.parse(res.body);
};
const confirm = (kind: string, id: number, body: Record<string, unknown> = {}, agent = ctx.ana) =>
  send(agent, "post", `/api/bills/${kind}/${id}/confirm`, body);

describe("auth and validation", () => {
  it("needs a session and a CSRF token", async () => {
    const app = makeApp(prisma);
    for (const url of ["/api/dashboard", "/api/budgets", "/api/allowances", "/api/bills"]) {
      expect((await request(app).get(`${url}?month=${M}`)).status, url).toBe(401);
    }
    expect((await ctx.ana.put("/api/budgets").send({})).status).toBe(403);
    expect((await ctx.ana.post("/api/bills/recurrence/1/confirm").send({})).status).toBe(403);
  });

  it("rejects a bad month, kind or body with 400", async () => {
    expect((await ctx.ana.get("/api/dashboard?month=2027-13")).status).toBe(400);
    expect((await ctx.ana.get("/api/dashboard")).status).toBe(400);
    expect((await confirm("other", 1)).status).toBe(400);
    expect((await confirm("recurrence", 999)).status).toBe(404);
    expect((await rule({ dayOfMonth: 32 })).status).toBe(400);
    expect((await rule({ scope: "personal" })).status).toBe(400);
    expect((await send(ctx.ana, "post", "/api/installment-plans", {})).status).toBe(400);
    const res = await send(ctx.ana, "post", "/api/bills/recurrence/1/cancel", {});
    expect(res.status).toBe(400);
  });
});

describe("dashboard: guide worked example", () => {
  it("10.000 income, 5.000 expenses, 2x1.000 allowances -> 3.000 savings", async () => {
    await tx({ type: "income", amount: "10000.00" });
    await tx({ type: "expense", amount: "5000.00" });
    for (const ownerId of [ctx.anaId, ctx.betoId]) {
      const res = await send(ctx.ana, "post", "/api/allowances", {
        ownerId,
        month: M,
        amount: "1000.00",
      });
      expect(res.status).toBe(201);
    }
    const d = await dash();
    expect(d).toMatchObject({
      householdIncome: "10000.00",
      sharedExpensesNet: "5000.00",
      allowanceAllocations: "2000.00",
      savingsBeforeGoals: "3000.00",
      goalAllocationsNet: "0.00",
      unallocatedSavings: "3000.00",
      savingsRate: "30.0",
    });
    expect(d.people.map((p) => p.closingBalance)).toEqual(["1000.00", "1000.00"]);
  });

  it("subtracts linked refunds and has a null rate without income", async () => {
    const e = await tx({ type: "expense", amount: "500.00" });
    await tx({
      type: "refund",
      amount: "120.00",
      relatedTransactionId: e.body.id,
      // Refund date in another month: it still belongs to the expense month.
      transactionDate: "2027-04-02",
    });
    const d = await dash();
    expect(d.sharedExpensesNet).toBe("380.00");
    expect(d.savingsRate).toBeNull();
    expect(d.savingsBeforeGoals).toBe("-380.00");
  });

  it("personal spending and credits move only that person's balance; it carries over", async () => {
    await send(ctx.ana, "post", "/api/allowances", {
      ownerId: ctx.anaId,
      month: "2027-02",
      amount: "300.00",
    });
    const personal = (body: Record<string, unknown>) =>
      tx({ scope: "personal", ownerId: ctx.anaId, ...body });
    await personal({ type: "expense", amount: "100.00", transactionDate: "2027-02-10" });
    await personal({ type: "other_receipt", amount: "40.00" });
    const d = await dash();
    const ana = d.people.find((p) => p.userId === ctx.anaId)!;
    expect(ana).toMatchObject({
      allowanceAllocated: "0.00",
      personalSpent: "0.00",
      personalCredits: "40.00",
      closingBalance: "240.00",
    });
    // Personal spending is not household spending.
    expect(d.sharedExpensesNet).toBe("0.00");
    expect(d.people.find((p) => p.userId === ctx.betoId)!.closingBalance).toBe("0.00");
  });
});

describe("dashboard: categorySpending", () => {
  it("nets refunds per category, biggest first, null for none; sums to sharedExpensesNet", async () => {
    const other = await prisma.category.create({ data: { name: "Lazer" } });
    const e1 = await tx({ type: "expense", amount: "100.00" });
    await tx({ type: "expense", amount: "300.00", categoryId: other.id });
    // Uncategorized expenses can only come from old data: write the row directly.
    await prisma.transaction.create({
      data: {
        type: "expense",
        status: "confirmed",
        amount: "50.55",
        description: "old",
        transactionDate: new Date(`${M}-07T00:00:00Z`),
        scope: "household",
        payerId: ctx.anaId,
        createdById: ctx.anaId,
        updatedById: ctx.anaId,
      },
    });
    await tx({ type: "expense", amount: "40.00", scope: "personal", ownerId: ctx.anaId });
    await tx({ type: "refund", amount: "30.00", relatedTransactionId: e1.body.id });
    // Voided and other-month rows do not count.
    const v = await tx({ type: "expense", amount: "999.00" });
    await send(ctx.ana, "post", `/api/transactions/${v.body.id}/void`, { reason: "x" });
    await tx({ type: "expense", amount: "77.00", transactionDate: "2027-02-05" });
    const d = await dash();
    expect(d.categorySpending).toEqual([
      { categoryId: other.id, amount: "300.00" },
      { categoryId: ctx.categoryId, amount: "70.00" },
      { categoryId: null, amount: "50.55" },
    ]);
    const sum = d.categorySpending.reduce((a, c) => a + Math.round(Number(c.amount) * 100), 0);
    expect(sum).toBe(Math.round(Number(d.sharedExpensesNet) * 100));
    expect(d.sharedExpensesNet).toBe("420.55");
  });

  it("is empty for a month without expenses", async () => {
    expect((await dash()).categorySpending).toEqual([]);
  });
});

describe("dashboard: upcoming", () => {
  it("lists the next 5 planned bills from today, soonest first, active rules only", async () => {
    // Clock is 2027-03-15. Day 10 rows in March are overdue and must not show.
    const r10 = await rule({ description: "Dia 10", dayOfMonth: 10 });
    expect(r10.status).toBe(201);
    await rule({ description: "Dia 20", dayOfMonth: 20 });
    const d = await dash();
    expect(d.upcoming.length).toBeLessThanOrEqual(5);
    for (const b of d.upcoming) billSchema.parse(b);
    const dates = d.upcoming.map((b) => b.dueDate);
    expect(dates).toEqual([...dates].sort());
    expect(dates.every((x) => x >= "2027-03-15")).toBe(true);
    expect(d.upcoming[0]?.description).not.toBe("Dia 10");
    expect(d.upcoming.every((b) => b.status === "planned")).toBe(true);
  });

  it("drops bills of paused rules and bills already confirmed", async () => {
    await rule({ description: "Dia 20", dayOfMonth: 20 });
    const row = await prisma.recurrenceOccurrence.findFirstOrThrow({
      where: { dueDate: new Date("2027-03-20T00:00:00Z") },
    });
    expect((await dash()).upcoming.map((b) => b.id)).toContain(row.id);
    await prisma.recurrenceRule.update({ where: { id: row.ruleId }, data: { state: "paused" } });
    expect((await dash()).upcoming).toEqual([]);
    await prisma.recurrenceRule.update({ where: { id: row.ruleId }, data: { state: "active" } });
    await confirm("recurrence", row.id);
    expect((await dash()).upcoming.map((b) => b.id)).not.toContain(row.id);
  });

  it("caps at 5 and includes installments", async () => {
    await rule({ description: "Dia 20", dayOfMonth: 20 });
    await send(ctx.ana, "post", "/api/installment-plans", {
      description: "Geladeira",
      totalAmount: "100.00",
      installmentCount: 4,
      firstDueDate: "2027-03-18",
      scope: "household",
      categoryId: ctx.categoryId,
    });
    const d = await dash();
    expect(d.upcoming).toHaveLength(5);
    expect(d.upcoming[0]?.kind).toBe("installment");
  });
});

describe("category kind in planning", () => {
  it("rules, plans and budgets need an expense category; confirm too", async () => {
    const r = await rule({ categoryId: ctx.incomeCategoryId });
    expect(r.status).toBe(400);
    expect(r.body.error.fields.categoryId).toBeDefined();
    const p = await send(ctx.ana, "post", "/api/installment-plans", {
      description: "x",
      totalAmount: "100.00",
      installmentCount: 2,
      firstDueDate: `${M}-20`,
      scope: "household",
      categoryId: ctx.incomeCategoryId,
    });
    expect(p.status).toBe(400);
    const token = await csrfToken(ctx.ana);
    const b = await ctx.ana
      .put("/api/budgets")
      .set("X-CSRF-Token", token)
      .send({ period: M, categoryId: ctx.incomeCategoryId, amount: "10.00", mode: "from_now" });
    expect(b.status).toBe(400);
    // A row that points at an income category (bad data) cannot be confirmed.
    await rule({ description: "Dia 20", dayOfMonth: 20 });
    const row = await prisma.recurrenceOccurrence.findFirstOrThrow({ include: { rule: true } });
    await prisma.recurrenceRule.update({
      where: { id: row.ruleId },
      data: { categoryId: ctx.incomeCategoryId },
    });
    const c = await confirm("recurrence", row.id);
    expect(c.status).toBe(400);
    expect(c.body.error.fields.categoryId).toBeDefined();
  });
});

describe("allowances", () => {
  const alloc = (ownerId: number, amount = "500.00", month = M) =>
    send(ctx.beto, "post", "/api/allowances", { ownerId, month, amount });

  it("creates one allocation per person and month; the second is 409 allocation_exists", async () => {
    const first = await alloc(ctx.anaId);
    expect(first.status).toBe(201);
    const o = allowanceOverviewSchema.parse(first.body);
    expect(o.people.find((p) => p.ownerId === ctx.anaId)).toMatchObject({
      allocation: "500.00",
      closingBalance: "500.00",
    });
    expect(o.people.find((p) => p.ownerId === ctx.betoId)!.allocation).toBeNull();
    const second = await alloc(ctx.anaId, "600.00");
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("allocation_exists");
    expect((await alloc(ctx.anaId, "600.00", "2027-04")).status).toBe(201);
  });

  it("two parallel allocations give one 201 and one 409", async () => {
    const res = await Promise.all([alloc(ctx.anaId), alloc(ctx.anaId)]);
    expect(res.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await prisma.personalAllowanceEntry.count()).toBe(1);
  });

  it("rejects an unknown owner", async () => {
    expect((await alloc(9999)).status).toBe(400);
  });
});

describe("budgets", () => {
  it("edits, versions and reports spent net of refunds", async () => {
    const token = (await ctx.ana.get("/api/auth/csrf")).body.csrfToken as string;
    const edit = (body: Record<string, unknown>) =>
      ctx.ana.put("/api/budgets").set("X-CSRF-Token", token).send(body);

    const e = await tx({ type: "expense", amount: "80.00" });
    await tx({ type: "refund", amount: "30.00", relatedTransactionId: e.body.id });
    await tx({
      type: "expense",
      amount: "20.00",
      categoryId: ctx.categoryId,
      scope: "personal",
      ownerId: ctx.anaId,
    });

    const r1 = await edit({
      categoryId: ctx.categoryId,
      period: M,
      amount: "200.00",
      mode: "going_forward",
    });
    expect(r1.status).toBe(200);
    const o = budgetOverviewSchema.parse(r1.body);
    expect(o.categories.find((c) => c.categoryId === ctx.categoryId)).toEqual({
      categoryId: ctx.categoryId,
      amount: "200.00",
      spent: "50.00",
    });
    expect(o.overall).toEqual({ categoryId: null, amount: null, spent: "50.00" });

    expect(
      (await edit({ categoryId: null, period: M, amount: "900.00", mode: "going_forward" })).status,
    ).toBe(200);
    const next = budgetOverviewSchema.parse((await ctx.ana.get("/api/budgets?month=2027-05")).body);
    expect(next.overall.amount).toBe("900.00");
    const before = budgetOverviewSchema.parse(
      (await ctx.ana.get("/api/budgets?month=2027-02")).body,
    );
    expect(before.overall.amount).toBeNull();

    const d = await dash();
    expect(d.overallBudget).toEqual({ budget: "900.00", spent: "50.00" });

    expect(
      (await edit({ categoryId: 999, period: M, amount: "1.00", mode: "going_forward" })).status,
    ).toBe(400);
    expect(
      (await edit({ categoryId: null, period: M, amount: "-1.00", mode: "going_forward" })).status,
    ).toBe(400);
  });
});

describe("recurrence generation", () => {
  it("two parallel dashboard loads give no 500 and no duplicates", async () => {
    const r = await prisma.recurrenceRule.create({
      data: {
        description: "Luz",
        expectedAmount: "50.00",
        dayOfMonth: 5,
        startDate: new Date("2027-01-01T00:00:00Z"),
        scope: "household",
        categoryId: ctx.categoryId,
        createdById: ctx.anaId,
        updatedById: ctx.anaId,
      },
    });
    for (let round = 0; round < 3; round++) {
      const month = `2027-0${3 + round}`;
      const res = await Promise.all([
        ctx.ana.get(`/api/dashboard?month=${month}`),
        ctx.beto.get(`/api/dashboard?month=${month}`),
        ctx.ana.get(`/api/dashboard?month=${month}`),
        ctx.beto.get(`/api/bills?month=${month}`),
      ]);
      expect(res.map((x) => x.status)).toEqual([200, 200, 200, 200]);
    }
    const rows = await prisma.recurrenceOccurrence.findMany({ where: { ruleId: r.id } });
    const keys = rows.map((x) => x.periodKey).sort();
    expect(keys).toEqual(["2027-03", "2027-04", "2027-05", "2027-06", "2027-07", "2027-08"]);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("paused rules do not generate", async () => {
    const created = await rule();
    const id = (await ctx.ana.get("/api/recurrence-rules")).body.items[0].id as number;
    expect(created.status).toBe(201);
    await prisma.recurrenceOccurrence.deleteMany();
    const p = await send(ctx.ana, "patch", `/api/recurrence-rules/${id}`, { state: "paused" });
    expect(recurrenceRuleSchema.parse(p.body).state).toBe("paused");
    await dash();
    expect(await prisma.recurrenceOccurrence.count()).toBe(0);
  });

  it("month-end matrix: day 31 clamps in short months, leap year too", async () => {
    await rule({ dayOfMonth: 31, startDate: "2027-03-01" });
    const days: string[] = [];
    for (const m of ["2027-03", "2027-04", "2027-05", "2027-06"]) {
      days.push(...(await bills(m)).items.map((b) => b.dueDate));
    }
    expect(days).toEqual(["2027-03-31", "2027-04-30", "2027-05-31", "2027-06-30"]);

    await rule({ dayOfMonth: 30, startDate: "2028-02-01", description: "Leap" });
    const leap = (await bills("2028-02")).items.filter((b) => b.description === "Leap");
    expect(leap.map((b) => b.dueDate)).toEqual(["2028-02-29"]);
    await rule({ dayOfMonth: 29, startDate: "2029-02-01", description: "NoLeap" });
    expect((await bills("2029-02")).items.map((b) => b.dueDate)).toContain("2029-02-28");
  });

  it("creating a rule returns the bill list and fills 4 months", async () => {
    const res = await rule({ startDate: "2027-06-15", dayOfMonth: 20 });
    expect(res.status).toBe(201);
    const list = billListSchema.parse(res.body);
    expect(list.month).toBe("2027-06");
    expect(list.items).toHaveLength(1);
    expect(await prisma.recurrenceOccurrence.count()).toBe(4);
  });

  it("an end date stops generation", async () => {
    await rule({ endDate: "2027-04-30" });
    await dash("2027-03");
    expect(await prisma.recurrenceOccurrence.count()).toBe(2);
  });

  it("patching the amount updates planned rows only", async () => {
    await rule();
    const list = await bills();
    const occId = list.items[0]!.id;
    await confirm("recurrence", occId);
    const ruleId = list.items[0]!.parentId;
    const p = await send(ctx.beto, "patch", `/api/recurrence-rules/${ruleId}`, {
      expectedAmount: "150.00",
    });
    expect(p.status).toBe(200);
    const items = (await bills("2027-04")).items;
    expect(items[0]!.expectedAmount).toBe("150.00");
    expect((await bills()).items[0]!.expectedAmount).toBe("100.00");
    expect(
      (await send(ctx.beto, "patch", "/api/recurrence-rules/999", { state: "ended" })).status,
    ).toBe(404);
    expect((await send(ctx.beto, "patch", `/api/recurrence-rules/${ruleId}`, {})).status).toBe(400);
  });
});

describe("installment plans", () => {
  const plan = (over: Record<string, unknown>) =>
    send(ctx.ana, "post", "/api/installment-plans", {
      description: "Geladeira",
      totalAmount: "100.00",
      installmentCount: 3,
      firstDueDate: `${M}-31`,
      scope: "household",
      categoryId: ctx.categoryId,
      ...over,
    });

  it("items always sum to the total, across counts and amounts", async () => {
    for (const total of ["0.02", "10.00", "100.00", "999.99", "1234.56", "99999.99"]) {
      for (const count of [2, 3, 7, 12, 59, 60]) {
        const res = await plan({ totalAmount: total, installmentCount: count });
        expect(res.status, `${total}/${count}`).toBe(201);
        const d = installmentPlanDetailSchema.parse(res.body);
        const sum = d.items.reduce((a, b) => a + BigInt(b.expectedAmount!.replace(".", "")), 0n);
        expect(sum, `${total}/${count}`).toBe(BigInt(total.replace(".", "")));
        expect(d.items).toHaveLength(count);
        expect(d.items.map((i) => i.sequenceNumber)).toEqual(
          Array.from({ length: count }, (_, i) => i + 1),
        );
      }
    }
  });

  it("clamps the due day and rejects a bad count", async () => {
    const d = installmentPlanDetailSchema.parse((await plan({})).body);
    expect(d.items.map((i) => i.dueDate)).toEqual(["2027-03-31", "2027-04-30", "2027-05-31"]);
    expect(d.items[0]).toMatchObject({
      installmentCount: 3,
      kind: "installment",
      status: "planned",
    });
    expect((await plan({ installmentCount: 1 })).status).toBe(400);
    expect((await plan({ categoryId: 9999 })).status).toBe(400);
  });

  it("creates nothing when the plan fails", async () => {
    expect((await plan({ payerId: 9999 })).status).toBe(400);
    expect(await prisma.installmentPlan.count()).toBe(0);
    expect(await prisma.installmentOccurrence.count()).toBe(0);
  });

  it("confirming an installment creates one linked expense", async () => {
    const d = installmentPlanDetailSchema.parse((await plan({})).body);
    const first = d.items[0]!;
    const res = await confirm("installment", first.id);
    expect(res.status).toBe(200);
    const bill = billSchema.parse(res.body);
    const t = await prisma.transaction.findUniqueOrThrow({ where: { id: bill.transactionId! } });
    expect(t).toMatchObject({
      type: "expense",
      status: "confirmed",
      installmentOccurrenceId: first.id,
    });
    expect(t.amount.toFixed(2)).toBe("33.33");
    expect((await dash()).sharedExpensesNet).toBe("33.33");
  });
});

describe("confirm and cancel", () => {
  it("planned does not count; confirmed counts once", async () => {
    await rule();
    let d = await dash();
    expect(d.plannedBillsTotal).toBe("100.00");
    expect(d.sharedExpensesNet).toBe("0.00");
    expect(d.overallBudget.spent).toBe("0.00");
    expect(await prisma.transaction.count()).toBe(0);

    const occ = (await bills()).items[0]!;
    const res = await confirm("recurrence", occ.id, {}, ctx.beto);
    expect(res.status).toBe(200);
    const bill = billSchema.parse(res.body);
    expect(bill.status).toBe("confirmed");
    d = await dash();
    expect(d.plannedBillsTotal).toBe("0.00");
    expect(d.sharedExpensesNet).toBe("100.00");

    const rows = await prisma.transaction.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      type: "expense",
      status: "confirmed",
      recurrenceOccurrenceId: occ.id,
      createdById: ctx.betoId,
      categoryId: ctx.categoryId,
    });
    expect(rows[0]!.transactionDate.toISOString().slice(0, 10)).toBe(`${M}-10`);

    const again = await confirm("recurrence", occ.id);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("invalid_state");
    expect(await prisma.transaction.count()).toBe(1);
    expect((await dash()).sharedExpensesNet).toBe("100.00");

    const audit = await prisma.auditEvent.findMany({ where: { action: "bill.confirm" } });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      entityType: "RecurrenceOccurrence",
      entityId: String(occ.id),
    });
  });

  it("parallel confirms give one 200 and one 409, one transaction", async () => {
    await rule();
    const occ = (await bills()).items[0]!;
    const res = await Promise.all([
      confirm("recurrence", occ.id, {}, ctx.ana),
      confirm("recurrence", occ.id, {}, ctx.beto),
      confirm("recurrence", occ.id, {}, ctx.ana),
    ]);
    expect(res.map((r) => r.status).sort()).toEqual([200, 409, 409]);
    expect(await prisma.transaction.count()).toBe(1);
    expect((await dash()).sharedExpensesNet).toBe("100.00");
  });

  it("uses the body fields over the occurrence", async () => {
    await rule();
    const occ = (await bills()).items[0]!;
    const res = await confirm("recurrence", occ.id, {
      amount: "123.45",
      transactionDate: `${M}-12`,
      payerId: ctx.betoId,
      accountId: ctx.accountId,
      paymentMethodId: ctx.paymentMethodId,
      notes: "pago",
    });
    expect(res.status).toBe(200);
    const t = await prisma.transaction.findFirstOrThrow();
    expect(t).toMatchObject({
      payerId: ctx.betoId,
      accountId: ctx.accountId,
      paymentMethodId: ctx.paymentMethodId,
      notes: "pago",
    });
    expect(t.amount.toFixed(2)).toBe("123.45");
    expect((await confirm("recurrence", occ.id, { amount: "0.00" })).status).toBe(400);
  });

  it("null expectedAmount: skipped in totals, counted as unknown, needs a body amount", async () => {
    await rule({ expectedAmount: null, description: "Agua" });
    await rule({ description: "Net", dayOfMonth: 12 });
    const d = await dash();
    expect(d.plannedBillsTotal).toBe("100.00");
    expect(d.plannedBillsUnknownCount).toBe(1);
    const list = await bills();
    expect(list.plannedTotal).toBe("100.00");
    expect(list.unknownCount).toBe(1);
    const unknown = list.items.find((b) => b.description === "Agua")!;
    expect(unknown.expectedAmount).toBeNull();

    const bad = await confirm("recurrence", unknown.id);
    expect(bad.status).toBe(400);
    expect(bad.body.error.fields.amount).toBeTruthy();
    expect(await prisma.transaction.count()).toBe(0);
    expect((await bills()).items.find((b) => b.id === unknown.id)!.status).toBe("planned");

    const ok = await confirm("recurrence", unknown.id, { amount: "42.00" });
    expect(ok.status).toBe(200);
    const after = await dash();
    expect(after.plannedBillsUnknownCount).toBe(0);
    expect(after.sharedExpensesNet).toBe("42.00");
  });

  it("cancel closes a planned bill, writes an audit row, and it never counts", async () => {
    await rule();
    const occ = (await bills()).items[0]!;
    expect(
      (await send(ctx.ana, "post", `/api/bills/recurrence/${occ.id}/cancel`, { reason: " " }))
        .status,
    ).toBe(400);
    const res = await send(ctx.beto, "post", `/api/bills/recurrence/${occ.id}/cancel`, {
      reason: "Cancelou o contrato",
    });
    expect(res.status).toBe(200);
    expect(billSchema.parse(res.body).status).toBe("cancelled");
    const d = await dash();
    expect(d.plannedBillsTotal).toBe("0.00");
    expect(d.sharedExpensesNet).toBe("0.00");
    expect(await prisma.transaction.count()).toBe(0);
    const audit = await prisma.auditEvent.findFirstOrThrow({ where: { action: "bill.cancel" } });
    expect(audit).toMatchObject({ reason: "Cancelou o contrato", actorId: ctx.betoId });
    expect((await confirm("recurrence", occ.id)).status).toBe(409);
    expect(
      (await send(ctx.ana, "post", `/api/bills/recurrence/${occ.id}/cancel`, { reason: "x" }))
        .status,
    ).toBe(409);
  });

  it("a confirmed bill cannot be cancelled", async () => {
    await rule();
    const occ = (await bills()).items[0]!;
    await confirm("recurrence", occ.id);
    const res = await send(ctx.ana, "post", `/api/bills/recurrence/${occ.id}/cancel`, {
      reason: "x",
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("invalid_state");
  });
});

describe("month window", () => {
  const ruleInDb = (startDate: string) =>
    prisma.recurrenceRule.create({
      data: {
        description: "Luz",
        expectedAmount: "50.00",
        dayOfMonth: 5,
        startDate: new Date(`${startDate}T00:00:00Z`),
        scope: "household",
        categoryId: ctx.categoryId,
        createdById: ctx.anaId,
        updatedById: ctx.anaId,
      },
    });

  it("rejects far months with 400 and writes no rows", async () => {
    await ruleInDb("2026-01-01");
    for (const month of ["2031-01", "9999-12", "2026-02", "2000-01"]) {
      for (const path of ["dashboard", "bills", "budgets", "allowances"]) {
        const res = await ctx.ana.get(`/api/${path}?month=${month}`);
        expect(res.status, `${path} ${month}`).toBe(400);
        expect(res.body.error.code).toBe("validation_error");
      }
    }
    expect(await prisma.recurrenceOccurrence.count()).toBe(0);
    expect((await ctx.ana.get("/api/dashboard?month=2026-03")).status).toBe(200);
    expect((await ctx.ana.get("/api/dashboard?month=2029-03")).status).toBe(200);
  });

  it("a past month generates only from the current month", async () => {
    await ruleInDb("2026-01-01");
    await dash("2026-06");
    const keys = (await prisma.recurrenceOccurrence.findMany()).map((o) => o.periodKey).sort();
    expect(keys).toEqual(["2027-03", "2027-04", "2027-05", "2027-06"]);
  });
});

describe("period helper", () => {
  it("uses the Sao Paulo month, not the UTC month", () => {
    expect(currentPeriod(new Date("2027-04-01T01:30:00Z"))).toBe("2027-03");
    expect(currentPeriod(new Date("2027-04-01T03:00:00Z"))).toBe("2027-04");
    expect(currentPeriod(new Date("2027-01-01T02:59:00Z"))).toBe("2026-12");
  });

  it("a new rule starts at the injected clock's month", async () => {
    const list = await createRule(
      prisma,
      ctx.anaId,
      recurrenceRuleCreateSchema.parse({
        description: "Aluguel",
        expectedAmount: "100.00",
        dayOfMonth: 10,
        startDate: "2026-01-01",
        scope: "household",
        categoryId: ctx.categoryId,
      }),
      new Date("2027-04-01T01:30:00Z"), // still March in Sao Paulo
    );
    expect(list.month).toBe("2027-03");
  });
});

describe("rule state and confirm guards", () => {
  const firstRuleId = async () =>
    (await ctx.ana.get("/api/recurrence-rules")).body.items[0].id as number;
  const planned = (ruleId: number) =>
    prisma.recurrenceOccurrence.count({ where: { ruleId, status: "planned" } });

  it("ended cancels all planned rows but keeps confirmed ones", async () => {
    await rule();
    const list = await bills();
    await confirm("recurrence", list.items[0]!.id);
    const id = await firstRuleId();
    expect(await planned(id)).toBe(3);
    const res = await send(ctx.ana, "patch", `/api/recurrence-rules/${id}`, { state: "ended" });
    expect(res.status).toBe(200);
    expect(await planned(id)).toBe(0);
    const rows = await prisma.recurrenceOccurrence.findMany({ where: { ruleId: id } });
    expect(rows.filter((r) => r.status === "cancelled")).toHaveLength(3);
    expect(rows.filter((r) => r.status === "confirmed")).toHaveLength(1);
    await dash("2027-05");
    expect(await prisma.recurrenceOccurrence.count()).toBe(4);
  });

  it("an earlier end date cancels planned rows after it", async () => {
    await rule();
    const id = await firstRuleId();
    await send(ctx.ana, "patch", `/api/recurrence-rules/${id}`, { endDate: "2027-04-30" });
    const rows = await prisma.recurrenceOccurrence.findMany({
      where: { ruleId: id },
      orderBy: { periodKey: "asc" },
    });
    expect(rows.map((r) => r.status)).toEqual(["planned", "planned", "cancelled", "cancelled"]);
  });

  it("paused keeps planned rows confirmable and stops new ones; resume continues", async () => {
    await rule();
    const id = await firstRuleId();
    await send(ctx.ana, "patch", `/api/recurrence-rules/${id}`, { state: "paused" });
    expect(await planned(id)).toBe(4);
    const occ = (await bills()).items[0]!;
    expect((await confirm("recurrence", occ.id)).status).toBe(200);
    await dash("2027-07");
    expect(await prisma.recurrenceOccurrence.count()).toBe(4);
    await send(ctx.ana, "patch", `/api/recurrence-rules/${id}`, { state: "active" });
    await dash("2027-07");
    expect(await prisma.recurrenceOccurrence.count()).toBe(8);
  });

  it("refuses to confirm a planned row of an ended rule", async () => {
    await rule();
    const id = await firstRuleId();
    const occ = (await bills()).items[0]!;
    await prisma.recurrenceRule.update({ where: { id }, data: { state: "ended" } });
    const res = await confirm("recurrence", occ.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("invalid_state");
    expect(await prisma.transaction.count()).toBe(0);
  });

  it("an ended rule cannot go back to active or paused", async () => {
    await rule();
    const id = await firstRuleId();
    await send(ctx.ana, "patch", `/api/recurrence-rules/${id}`, { state: "ended" });
    for (const state of ["active", "paused"]) {
      const res = await send(ctx.ana, "patch", `/api/recurrence-rules/${id}`, { state });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("invalid_state");
    }
    const same = await send(ctx.ana, "patch", `/api/recurrence-rules/${id}`, { state: "ended" });
    expect(same.status).toBe(200);
  });

  it("refuses to confirm when the inherited category is archived", async () => {
    await rule();
    const occ = (await bills()).items[0]!;
    await prisma.category.update({ where: { id: ctx.categoryId }, data: { active: false } });
    const bad = await confirm("recurrence", occ.id);
    expect(bad.status).toBe(400);
    expect(bad.body.error.fields.categoryId).toBeTruthy();
    expect(await prisma.transaction.count()).toBe(0);
  });

  it("checks the final account and payment method, inherited ones too", async () => {
    await rule({ accountId: ctx.accountId, paymentMethodId: ctx.paymentMethodId });
    const occ = (await bills()).items[0]!;
    await prisma.account.update({ where: { id: ctx.accountId }, data: { active: false } });
    const bad = await confirm("recurrence", occ.id);
    expect(bad.status).toBe(400);
    expect(bad.body.error.fields.accountId).toBeTruthy();
    await prisma.paymentMethod.update({
      where: { id: ctx.paymentMethodId },
      data: { active: false },
    });
    const bad2 = await confirm("recurrence", occ.id, { accountId: null });
    expect(bad2.status).toBe(400);
    expect(bad2.body.error.fields.paymentMethodId).toBeTruthy();
    expect(await prisma.transaction.count()).toBe(0);
    const ok = await confirm("recurrence", occ.id, { accountId: null, paymentMethodId: null });
    expect(ok.status).toBe(200);
  });
});

describe("PUT /budgets period window", () => {
  it("rejects periods outside the window, 9999-12 included", async () => {
    const token = (await ctx.ana.get("/api/auth/csrf")).body.csrfToken as string;
    for (const period of ["9999-12", "2020-01", "2030-04"]) {
      const res = await ctx.ana
        .put("/api/budgets")
        .set("X-CSRF-Token", token)
        .send({ categoryId: null, period, amount: "1.00", mode: "going_forward" });
      expect(res.status, period).toBe(400);
      expect(res.body.error.code).toBe("validation_error");
      expect(res.body.error.fields.period).toBeTruthy();
    }
    expect(await prisma.monthlyBudget.count()).toBe(0);
  });
});

describe("allocations of inactive users", () => {
  it("still count in the household allocation total", async () => {
    await tx({ type: "income", amount: "1000.00" });
    for (const ownerId of [ctx.anaId, ctx.betoId]) {
      await send(ctx.ana, "post", "/api/allowances", { ownerId, month: M, amount: "100.00" });
    }
    await prisma.user.update({ where: { id: ctx.betoId }, data: { active: false } });
    const d = await dash();
    expect(d.allowanceAllocations).toBe("200.00");
    expect(d.savingsBeforeGoals).toBe("800.00");
    expect(d.people.map((p) => p.userId)).toEqual([ctx.anaId]);
  });
});

describe("installment dates", () => {
  it("rejects a date that does not exist", async () => {
    const res = await send(ctx.ana, "post", "/api/installment-plans", {
      description: "Sofa",
      totalAmount: "100.00",
      installmentCount: 2,
      firstDueDate: "2026-02-30",
      scope: "household",
      categoryId: ctx.categoryId,
    });
    expect(res.status).toBe(400);
    expect(await prisma.installmentPlan.count()).toBe(0);
  });
});

describe("overdue bills", () => {
  // Clock is 2027-03-15. Occurrences are inserted directly so they can be in the past.
  const ruleRow = (state: "active" | "paused" | "ended" = "active") =>
    prisma.recurrenceRule.create({
      data: {
        description: "Luz",
        expectedAmount: "50.00",
        dayOfMonth: 5,
        startDate: new Date("2026-01-01T00:00:00Z"),
        state,
        scope: "household",
        categoryId: ctx.categoryId,
        createdById: ctx.anaId,
        updatedById: ctx.anaId,
      },
    });
  const occ = (ruleId: number, periodKey: string, status: "planned" | "confirmed" | "cancelled") =>
    prisma.recurrenceOccurrence.create({
      data: {
        ruleId,
        periodKey,
        dueDate: new Date(`${periodKey}-05T00:00:00Z`),
        expectedAmount: "50.00",
        status,
      },
    });

  it("lists planned bills from earlier months, apart from the month items", async () => {
    const r = await ruleRow();
    await occ(r.id, "2027-01", "planned");
    await occ(r.id, "2027-02", "planned");
    const list = await bills("2027-03");
    expect(list.overdue.map((b) => b.dueDate)).toEqual(["2027-01-05", "2027-02-05"]);
    expect(list.items.map((b) => b.dueDate)).toEqual(["2027-03-05"]);
    expect(list.plannedTotal).toBe("50.00");
    const apr = await bills("2027-04");
    // Today is 2027-03-15, so March 5 is overdue too; April items stay out.
    expect(apr.overdue.map((b) => b.dueDate)).toEqual(["2027-01-05", "2027-02-05", "2027-03-05"]);
    expect(apr.items.map((b) => b.dueDate)).toEqual(["2027-04-05"]);
  });

  it("skips confirmed, cancelled, and rows of ended or paused rules", async () => {
    const r = await ruleRow();
    await occ(r.id, "2027-01", "confirmed");
    await occ(r.id, "2027-02", "cancelled");
    expect((await bills("2027-03")).overdue).toEqual([]);
    const ended = await ruleRow("ended");
    await occ(ended.id, "2027-01", "planned");
    const paused = await ruleRow("paused");
    await occ(paused.id, "2027-02", "planned");
    expect((await bills("2027-03")).overdue).toEqual([]);
  });

  it("includes late installments", async () => {
    const plan = await prisma.installmentPlan.create({
      data: {
        description: "Sofa",
        totalAmount: "100.00",
        installmentCount: 2,
        firstDueDate: new Date("2027-01-10T00:00:00Z"),
        scope: "household",
        categoryId: ctx.categoryId,
        createdById: ctx.anaId,
        updatedById: ctx.anaId,
      },
    });
    await prisma.installmentOccurrence.createMany({
      data: [
        {
          planId: plan.id,
          sequenceNumber: 1,
          dueDate: new Date("2027-01-10T00:00:00Z"),
          expectedAmount: "50.00",
        },
        {
          planId: plan.id,
          sequenceNumber: 2,
          dueDate: new Date("2027-02-10T00:00:00Z"),
          expectedAmount: "50.00",
        },
      ],
    });
    const list = await bills("2027-03");
    expect(list.overdue.map((b) => [b.kind, b.sequenceNumber])).toEqual([
      ["installment", 1],
      ["installment", 2],
    ]);
  });
});
