import {
  Prisma,
  type InstallmentOccurrence,
  type InstallmentPlan,
  type PrismaClient,
  type RecurrenceOccurrence,
  type RecurrenceRule,
} from "@prisma/client";
import type {
  Bill,
  BillConfirm,
  BillKind,
  BillList,
  InstallmentPlanCreate,
  InstallmentPlanDetail,
  InstallmentPlanPatch,
  InstallmentPlanSummary,
  RecurrenceRule as RuleDto,
  RecurrenceRuleCreate,
  RecurrenceRulePatch,
} from "@spendual/shared";
import { AppError } from "../auth/errors.js";
import { centsToMoney, moneyToCents } from "../domain/accounting.js";
import {
  currentDate,
  currentPeriod,
  dateOnlyToDate,
  dateToDateOnly,
  nextPeriod,
} from "../lib/period.js";
import { parseMoney } from "../lib/serialize.js";
import { writeAudit } from "../lib/audit.js";
import { withRetry } from "../lib/withRetry.js";
import { generateForAllRules } from "./dashboard.js";
import { buildInstallmentRows } from "./installments.js";
import { generateForRules } from "./recurrence.js";
import { assertActiveUser, assertCatalogActive, invalid } from "./transactions.js";

type Db = Prisma.TransactionClient;

const money = (d: Prisma.Decimal | null): string | null => (d ? d.toFixed(2) : null);

type RecOcc = RecurrenceOccurrence & { rule: RecurrenceRule; transaction: { id: number } | null };
type InsOcc = InstallmentOccurrence & {
  plan: InstallmentPlan;
  transaction: { id: number } | null;
};

const recInclude = { rule: true, transaction: { select: { id: true } } } as const;
const insInclude = { plan: true, transaction: { select: { id: true } } } as const;

export function recurrenceBill(o: RecOcc): Bill {
  return {
    kind: "recurrence",
    id: o.id,
    parentId: o.ruleId,
    description: o.rule.description,
    dueDate: dateToDateOnly(o.dueDate),
    expectedAmount: money(o.expectedAmount),
    status: o.status,
    scope: o.rule.scope,
    ownerId: o.rule.ownerId,
    payerId: o.rule.payerId,
    categoryId: o.rule.categoryId,
    accountId: o.rule.accountId,
    paymentMethodId: o.rule.paymentMethodId,
    sequenceNumber: null,
    installmentCount: null,
    transactionId: o.transaction?.id ?? null,
  };
}

export function installmentBill(o: InsOcc): Bill {
  return {
    kind: "installment",
    id: o.id,
    parentId: o.planId,
    description: o.plan.description,
    dueDate: dateToDateOnly(o.dueDate),
    expectedAmount: money(o.expectedAmount),
    status: o.status,
    scope: o.plan.scope,
    ownerId: o.plan.ownerId,
    payerId: o.plan.payerId,
    categoryId: o.plan.categoryId,
    accountId: o.plan.accountId,
    paymentMethodId: null,
    sequenceNumber: o.sequenceNumber,
    installmentCount: o.plan.installmentCount,
    transactionId: o.transaction?.id ?? null,
  };
}

function ruleDto(r: RecurrenceRule): RuleDto {
  return {
    id: r.id,
    description: r.description,
    expectedAmount: money(r.expectedAmount),
    dayOfMonth: r.dayOfMonth,
    startDate: dateToDateOnly(r.startDate),
    endDate: r.endDate ? dateToDateOnly(r.endDate) : null,
    state: r.state,
    scope: r.scope,
    ownerId: r.ownerId,
    payerId: r.payerId,
    categoryId: r.categoryId,
    accountId: r.accountId,
    paymentMethodId: r.paymentMethodId,
  };
}

const byDue = (a: Bill, b: Bill) =>
  a.dueDate.localeCompare(b.dueDate) || a.kind.localeCompare(b.kind) || a.id - b.id;

export async function listBills(
  db: PrismaClient | Db,
  month: string,
  now: Date = new Date(),
): Promise<BillList> {
  const first = `${month}-01`;
  const dueDate = { gte: dateOnlyToDate(first), lt: dateOnlyToDate(`${nextPeriod(month)}-01`) };
  // Overdue: still planned, due before today and before this month, rule still active.
  const today = currentDate(now);
  const overdueDate = { lt: dateOnlyToDate(today < first ? today : first) };
  const open = { status: "planned" as const, dueDate: overdueDate };
  const [rec, ins, lateRec, lateIns] = await Promise.all([
    db.recurrenceOccurrence.findMany({ where: { dueDate }, include: recInclude }),
    db.installmentOccurrence.findMany({ where: { dueDate }, include: insInclude }),
    db.recurrenceOccurrence.findMany({
      where: { ...open, rule: { state: "active" } },
      include: recInclude,
    }),
    db.installmentOccurrence.findMany({ where: open, include: insInclude }),
  ]);
  const items = [...rec.map(recurrenceBill), ...ins.map(installmentBill)].sort(byDue);
  const overdue = [...lateRec.map(recurrenceBill), ...lateIns.map(installmentBill)].sort(byDue);
  let total = 0n;
  let unknownCount = 0;
  for (const b of items) {
    if (b.status !== "planned") continue;
    if (b.expectedAmount === null) unknownCount++;
    else total += moneyToCents(b.expectedAmount);
  }
  return { month, items, overdue, plannedTotal: centsToMoney(total), unknownCount };
}

/** The bills list also tops up recurring occurrences, so "A pagar" works without the dashboard. */
export async function getBills(
  prisma: PrismaClient,
  month: string,
  now: Date = new Date(),
): Promise<BillList> {
  await generateForAllRules(prisma, month, now);
  return listBills(prisma, month, now);
}

export async function listRules(prisma: PrismaClient): Promise<RuleDto[]> {
  const rows = await prisma.recurrenceRule.findMany({ orderBy: { id: "asc" } });
  return rows.map(ruleDto);
}

export async function createRule(
  prisma: PrismaClient,
  actorId: number,
  input: RecurrenceRuleCreate,
  now: Date = new Date(),
): Promise<BillList> {
  const startPeriod = input.startDate.slice(0, 7);
  const cur = currentPeriod(now);
  const from = startPeriod > cur ? startPeriod : cur;
  // The rule and its first occurrences are one transaction: a failure leaves no rule.
  await withRetry(() =>
    prisma.$transaction(async (tx) => {
      const payerId = input.payerId ?? actorId;
      await assertActiveUser(tx, payerId, "payerId");
      if (input.ownerId != null) await assertActiveUser(tx, input.ownerId, "ownerId");
      await assertCatalogActive(tx, input, "expense");
      const rule = await tx.recurrenceRule.create({
        data: {
          description: input.description,
          expectedAmount: input.expectedAmount === null ? null : parseMoney(input.expectedAmount),
          dayOfMonth: input.dayOfMonth,
          startDate: dateOnlyToDate(input.startDate),
          endDate: input.endDate ? dateOnlyToDate(input.endDate) : null,
          scope: input.scope,
          ownerId: input.ownerId ?? null,
          payerId,
          categoryId: input.categoryId,
          accountId: input.accountId ?? null,
          paymentMethodId: input.paymentMethodId ?? null,
          createdById: actorId,
          updatedById: actorId,
        },
      });
      await generateForRules(tx, [rule], from);
      await writeAudit(tx, {
        actorId,
        entityType: "RecurrenceRule",
        entityId: rule.id,
        action: "rule.create",
        after: ruleDto(rule),
      });
    }),
  );
  return listBills(prisma, from, now);
}

export function patchRule(
  prisma: PrismaClient,
  actorId: number,
  id: number,
  patch: RecurrenceRulePatch,
): Promise<RuleDto> {
  return withRetry(() =>
    prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: number }[]>(
        Prisma.sql`SELECT id FROM RecurrenceRule WHERE id = ${id} FOR UPDATE`,
      );
      const cur = locked.length ? await tx.recurrenceRule.findUnique({ where: { id } }) : null;
      if (!cur) throw new AppError(404, "not_found", "Recurrence rule not found");
      // Cancelled rows are not restored, so an ended rule cannot be reopened.
      if (cur.state === "ended" && patch.state !== undefined && patch.state !== "ended") {
        throw new AppError(409, "invalid_state", "The recurrence rule has ended");
      }
      if (patch.endDate != null && patch.endDate < dateToDateOnly(cur.startDate)) {
        throw invalid("endDate", "End before start");
      }
      const amount =
        patch.expectedAmount === undefined
          ? undefined
          : patch.expectedAmount === null
            ? null
            : parseMoney(patch.expectedAmount);
      const row = await tx.recurrenceRule.update({
        where: { id },
        data: {
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          ...(amount !== undefined ? { expectedAmount: amount } : {}),
          ...(patch.endDate !== undefined
            ? { endDate: patch.endDate ? dateOnlyToDate(patch.endDate) : null }
            : {}),
          ...(patch.state !== undefined ? { state: patch.state } : {}),
          updatedById: actorId,
        },
      });
      // Planned rows follow the rule's new amount. Confirmed and cancelled rows stay.
      if (amount !== undefined) {
        await tx.recurrenceOccurrence.updateMany({
          where: { ruleId: id, status: "planned" },
          data: { expectedAmount: amount },
        });
      }
      // Planned rows that the rule no longer covers are cancelled, never deleted:
      // "ended" cancels all of them; a new end date cancels those in later months.
      // "paused" keeps them (still confirmable); resuming makes generation continue.
      if (row.state === "ended") {
        await tx.recurrenceOccurrence.updateMany({
          where: { ruleId: id, status: "planned" },
          data: { status: "cancelled" },
        });
      } else if (row.endDate) {
        await tx.recurrenceOccurrence.updateMany({
          where: {
            ruleId: id,
            status: "planned",
            dueDate: { gt: row.endDate },
          },
          data: { status: "cancelled" },
        });
      }
      await writeAudit(tx, {
        actorId,
        entityType: "RecurrenceRule",
        entityId: id,
        action: "rule.update",
        before: ruleDto(cur),
        after: ruleDto(row),
      });
      return ruleDto(row);
    }),
  );
}

export function createInstallmentPlan(
  prisma: PrismaClient,
  actorId: number,
  input: InstallmentPlanCreate,
): Promise<InstallmentPlanDetail> {
  const rows = buildInstallmentRows(input.totalAmount, input.installmentCount, input.firstDueDate);
  return withRetry(() =>
    prisma.$transaction(async (tx) => {
      const payerId = input.payerId ?? actorId;
      await assertActiveUser(tx, payerId, "payerId");
      if (input.ownerId != null) await assertActiveUser(tx, input.ownerId, "ownerId");
      await assertCatalogActive(tx, input, "expense");
      const plan = await tx.installmentPlan.create({
        data: {
          description: input.description,
          totalAmount: parseMoney(input.totalAmount),
          installmentCount: input.installmentCount,
          firstDueDate: dateOnlyToDate(input.firstDueDate),
          scope: input.scope,
          ownerId: input.ownerId ?? null,
          payerId,
          categoryId: input.categoryId,
          accountId: input.accountId ?? null,
          notes: input.notes ?? null,
          createdById: actorId,
          updatedById: actorId,
        },
      });
      await tx.installmentOccurrence.createMany({
        data: rows.map((r) => ({
          planId: plan.id,
          sequenceNumber: r.sequenceNumber,
          dueDate: dateOnlyToDate(r.dueDate),
          expectedAmount: parseMoney(r.expectedAmount),
        })),
      });
      const occ = await tx.installmentOccurrence.findMany({
        where: { planId: plan.id },
        orderBy: { sequenceNumber: "asc" },
        include: insInclude,
      });
      const detail = {
        id: plan.id,
        description: plan.description,
        totalAmount: plan.totalAmount.toFixed(2),
        installmentCount: plan.installmentCount,
        firstDueDate: dateToDateOnly(plan.firstDueDate),
        items: occ.map(installmentBill),
      };
      await writeAudit(tx, {
        actorId,
        entityType: "InstallmentPlan",
        entityId: plan.id,
        action: "plan.create",
        after: {
          id: plan.id,
          description: plan.description,
          totalAmount: detail.totalAmount,
          installmentCount: plan.installmentCount,
          firstDueDate: detail.firstDueDate,
        },
      });
      return detail;
    }),
  );
}

/** Lock the occurrence row, then read it fresh with its parent. Throws 404 if missing. */
async function lockBill(tx: Db, kind: BillKind, id: number): Promise<Bill> {
  const locked =
    kind === "recurrence"
      ? await tx.$queryRaw<{ id: number }[]>(
          Prisma.sql`SELECT id FROM RecurrenceOccurrence WHERE id = ${id} FOR UPDATE`,
        )
      : await tx.$queryRaw<{ id: number }[]>(
          Prisma.sql`SELECT id FROM InstallmentOccurrence WHERE id = ${id} FOR UPDATE`,
        );
  const bill = locked.length ? await readBill(tx, kind, id) : null;
  if (!bill) throw new AppError(404, "not_found", "Bill not found");
  return bill;
}

async function readBill(tx: Db, kind: BillKind, id: number): Promise<Bill | null> {
  if (kind === "recurrence") {
    const o = await tx.recurrenceOccurrence.findUnique({ where: { id }, include: recInclude });
    return o ? recurrenceBill(o) : null;
  }
  const o = await tx.installmentOccurrence.findUnique({ where: { id }, include: insInclude });
  return o ? installmentBill(o) : null;
}

function requirePlanned(bill: Bill): void {
  if (bill.status !== "planned") {
    throw new AppError(409, "invalid_state", `Bill is ${bill.status}, not planned`);
  }
}

function auditBill(
  tx: Db,
  actorId: number,
  action: string,
  before: Bill,
  after: Bill,
  reason: string | null,
) {
  return writeAudit(tx, {
    actorId,
    entityType: before.kind === "recurrence" ? "RecurrenceOccurrence" : "InstallmentOccurrence",
    entityId: before.id,
    action,
    before,
    after,
    reason,
  });
}

async function setStatus(tx: Db, kind: BillKind, id: number, status: "confirmed" | "cancelled") {
  if (kind === "recurrence") {
    await tx.recurrenceOccurrence.update({ where: { id }, data: { status } });
  } else {
    await tx.installmentOccurrence.update({ where: { id }, data: { status } });
  }
}

export function confirmBill(
  prisma: PrismaClient,
  actorId: number,
  kind: BillKind,
  id: number,
  input: BillConfirm,
): Promise<Bill> {
  return withRetry(() =>
    prisma.$transaction(async (tx) => {
      const cur = await lockBill(tx, kind, id);
      requirePlanned(cur);
      if (kind === "recurrence") {
        const rule = await tx.recurrenceRule.findUnique({
          where: { id: cur.parentId },
          select: { state: true },
        });
        if (rule?.state === "ended") {
          throw new AppError(409, "invalid_state", "The recurrence rule has ended");
        }
      }
      const amount = input.amount ?? cur.expectedAmount;
      if (amount === null)
        throw invalid("amount", "Amount required: the expected amount is unknown");
      if (cur.categoryId == null) throw invalid("categoryId", "Category required");

      const payerId = input.payerId ?? cur.payerId ?? actorId;
      const accountId = input.accountId !== undefined ? input.accountId : cur.accountId;
      const paymentMethodId =
        input.paymentMethodId !== undefined ? input.paymentMethodId : cur.paymentMethodId;
      if (input.payerId !== undefined) await assertActiveUser(tx, input.payerId, "payerId");
      // Check the final values, inherited ones too: an archived account must not be used.
      await assertCatalogActive(
        tx,
        { categoryId: cur.categoryId, accountId, paymentMethodId },
        "expense",
      );

      const txn = await tx.transaction.create({
        data: {
          type: "expense",
          status: "confirmed",
          amount: parseMoney(amount),
          description: cur.description,
          transactionDate: dateOnlyToDate(input.transactionDate ?? cur.dueDate),
          scope: cur.scope,
          ownerId: cur.ownerId,
          payerId,
          categoryId: cur.categoryId,
          accountId,
          paymentMethodId,
          notes: input.notes ?? null,
          ...(kind === "recurrence"
            ? { recurrenceOccurrenceId: id }
            : { installmentOccurrenceId: id }),
          createdById: actorId,
          updatedById: actorId,
        },
      });
      await setStatus(tx, kind, id, "confirmed");
      const after: Bill = { ...cur, status: "confirmed", transactionId: txn.id };
      await auditBill(tx, actorId, "bill.confirm", cur, after, null);
      return after;
    }),
  );
}

export function cancelBill(
  prisma: PrismaClient,
  actorId: number,
  kind: BillKind,
  id: number,
  reason: string,
): Promise<Bill> {
  return withRetry(() =>
    prisma.$transaction(async (tx) => {
      const cur = await lockBill(tx, kind, id);
      requirePlanned(cur);
      await setStatus(tx, kind, id, "cancelled");
      const after: Bill = { ...cur, status: "cancelled" };
      await auditBill(tx, actorId, "bill.cancel", cur, after, reason);
      return after;
    }),
  );
}

type PlanWithRows = InstallmentPlan & { occurrences: InstallmentOccurrence[] };

function planSummary(p: PlanWithRows): InstallmentPlanSummary {
  const rows = [...p.occurrences].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  const planned = rows.filter((o) => o.status === "planned");
  const paidCount = rows.filter((o) => o.status === "confirmed").length;
  const remaining = planned.reduce((sum, o) => sum + moneyToCents(o.expectedAmount.toFixed(2)), 0n);
  return {
    id: p.id,
    description: p.description,
    totalAmount: p.totalAmount.toFixed(2),
    installmentCount: p.installmentCount,
    firstDueDate: dateToDateOnly(p.firstDueDate),
    paidCount,
    plannedCount: planned.length,
    cancelledCount: rows.filter((o) => o.status === "cancelled").length,
    remainingAmount: centsToMoney(remaining),
    nextAmount: planned[0] ? planned[0].expectedAmount.toFixed(2) : null,
    status: planned.length > 0 ? "active" : paidCount > 0 ? "finished" : "cancelled",
  };
}

export async function listPlans(prisma: PrismaClient): Promise<InstallmentPlanSummary[]> {
  const plans = await prisma.installmentPlan.findMany({
    orderBy: { id: "desc" },
    include: { occurrences: true },
  });
  return plans.map(planSummary);
}

/** Lock the plan row, then read it fresh with its installments. Throws 404 if missing. */
async function lockPlan(tx: Db, id: number): Promise<PlanWithRows> {
  const locked = await tx.$queryRaw<{ id: number }[]>(
    Prisma.sql`SELECT id FROM InstallmentPlan WHERE id = ${id} FOR UPDATE`,
  );
  const plan = locked.length
    ? await tx.installmentPlan.findUnique({ where: { id }, include: { occurrences: true } })
    : null;
  if (!plan) throw new AppError(404, "not_found", "Installment plan not found");
  return plan;
}

export function patchPlan(
  prisma: PrismaClient,
  actorId: number,
  id: number,
  patch: InstallmentPlanPatch,
): Promise<InstallmentPlanSummary> {
  return withRetry(() =>
    prisma.$transaction(async (tx) => {
      const cur = await lockPlan(tx, id);
      const hasPlanned = cur.occurrences.some((o) => o.status === "planned");
      if (patch.installmentAmount !== undefined && !hasPlanned) {
        throw new AppError(409, "invalid_state", "The plan has no planned installments");
      }
      await tx.installmentPlan.update({
        where: { id },
        data: {
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          updatedById: actorId,
        },
      });
      if (patch.installmentAmount !== undefined) {
        await tx.installmentOccurrence.updateMany({
          where: { planId: id, status: "planned" },
          data: { expectedAmount: parseMoney(patch.installmentAmount) },
        });
      }
      const after = await lockPlan(tx, id);
      await writeAudit(tx, {
        actorId,
        entityType: "InstallmentPlan",
        entityId: id,
        action: "plan.update",
        before: planSummary(cur),
        after: planSummary(after),
      });
      return planSummary(after);
    }),
  );
}

export function cancelPlan(
  prisma: PrismaClient,
  actorId: number,
  id: number,
  reason: string,
): Promise<InstallmentPlanSummary> {
  return withRetry(() =>
    prisma.$transaction(async (tx) => {
      const cur = await lockPlan(tx, id);
      if (!cur.occurrences.some((o) => o.status === "planned")) {
        throw new AppError(409, "invalid_state", "The plan has no planned installments");
      }
      await tx.installmentOccurrence.updateMany({
        where: { planId: id, status: "planned" },
        data: { status: "cancelled" },
      });
      await tx.installmentPlan.update({ where: { id }, data: { updatedById: actorId } });
      const after = await lockPlan(tx, id);
      await writeAudit(tx, {
        actorId,
        entityType: "InstallmentPlan",
        entityId: id,
        action: "plan.cancel",
        before: planSummary(cur),
        after: planSummary(after),
        reason,
      });
      return planSummary(after);
    }),
  );
}
