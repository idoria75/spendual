import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { installmentPlanListSchema, installmentPlanSummarySchema } from "@spendual/shared";
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

describe("installment plans: edit and cancel", () => {
  it("renames, re-prices only the planned installments, and cancels the rest", async () => {
    const created = await send(ctx.ana, "post", "/api/installment-plans", {
      description: "Sofá",
      totalAmount: "300.00",
      installmentCount: 3,
      firstDueDate: "2027-03-10",
      scope: "household",
      categoryId: ctx.categoryId,
    });
    expect(created.status).toBe(201);
    const [first] = created.body.items as { id: number }[];
    const paid = await send(ctx.ana, "post", `/api/bills/installment/${first!.id}/confirm`, {});
    expect(paid.status).toBe(200);

    const listed = installmentPlanListSchema.parse(
      (await ctx.ana.get("/api/installment-plans")).body,
    );
    expect(listed.items).toHaveLength(1);
    expect(listed.items[0]).toMatchObject({
      description: "Sofá",
      paidCount: 1,
      plannedCount: 2,
      remainingAmount: "200.00",
      nextAmount: "100.00",
      status: "active",
    });
    const id = created.body.id as number;

    // Rename and new amount: the paid installment keeps its amount.
    const patched = await send(ctx.beto, "patch", `/api/installment-plans/${id}`, {
      description: "Sofá da sala",
      installmentAmount: "150.00",
    });
    expect(patched.status).toBe(200);
    expect(installmentPlanSummarySchema.parse(patched.body)).toMatchObject({
      description: "Sofá da sala",
      remainingAmount: "300.00",
      nextAmount: "150.00",
      paidCount: 1,
    });
    const rows = await prisma.installmentOccurrence.findMany({
      where: { planId: id },
      orderBy: { sequenceNumber: "asc" },
    });
    expect(rows.map((r) => `${r.status}:${r.expectedAmount.toFixed(2)}`)).toEqual([
      "confirmed:100.00",
      "planned:150.00",
      "planned:150.00",
    ]);
    expect((await send(ctx.ana, "patch", `/api/installment-plans/${id}`, {})).status).toBe(400);
    expect(
      (await send(ctx.ana, "patch", "/api/installment-plans/9999", { description: "x" })).status,
    ).toBe(404);

    // Cancel needs a reason, keeps paid rows, and cannot run twice.
    expect((await send(ctx.ana, "post", `/api/installment-plans/${id}/cancel`, {})).status).toBe(
      400,
    );
    const cancelled = await send(ctx.ana, "post", `/api/installment-plans/${id}/cancel`, {
      reason: "Devolvi o sofá",
    });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body).toMatchObject({
      plannedCount: 0,
      cancelledCount: 2,
      paidCount: 1,
      status: "finished",
      nextAmount: null,
    });
    expect(
      (await send(ctx.ana, "post", `/api/installment-plans/${id}/cancel`, { reason: "x" })).status,
    ).toBe(409);
    const noPlanned = await send(ctx.ana, "patch", `/api/installment-plans/${id}`, {
      installmentAmount: "10.00",
    });
    expect(noPlanned.status).toBe(409);
    // A rename is still fine.
    expect(
      (
        await send(ctx.ana, "patch", `/api/installment-plans/${id}`, {
          description: "Sofá (devolvido)",
        })
      ).status,
    ).toBe(200);

    const audits = await prisma.auditEvent.findMany({ where: { entityType: "InstallmentPlan" } });
    expect(audits.map((a) => a.action).sort()).toEqual([
      "plan.cancel",
      "plan.update",
      "plan.update",
    ]);
    expect(audits.find((a) => a.action === "plan.cancel")!.reason).toBe("Devolvi o sofá");
  });

  it("writes an audit event when a recurrence rule changes", async () => {
    const res = await send(ctx.ana, "post", "/api/recurrence-rules", {
      description: "Condomínio",
      expectedAmount: "780.00",
      dayOfMonth: 5,
      startDate: "2027-03-01",
      scope: "household",
      categoryId: ctx.categoryId,
    });
    expect(res.status).toBe(201);
    const ruleId = (await prisma.recurrenceRule.findFirstOrThrow()).id;
    const patched = await send(ctx.beto, "patch", `/api/recurrence-rules/${ruleId}`, {
      expectedAmount: "400.00",
    });
    expect(patched.body.expectedAmount).toBe("400.00");
    const planned = await prisma.recurrenceOccurrence.findMany({ where: { ruleId } });
    expect(planned.every((o) => o.expectedAmount?.toFixed(2) === "400.00")).toBe(true);
    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { entityType: "RecurrenceRule" },
    });
    expect(audit).toMatchObject({ action: "rule.update", actorId: ctx.betoId });
  });
});
