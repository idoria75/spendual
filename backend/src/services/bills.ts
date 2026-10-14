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
  RecurrenceRule as RuleDto,
  RecurrenceRuleCreate,
  RecurrenceRulePatch,
} from "@spendual/shared";
import { AppError } from "../auth/errors.js";
import { centsToMoney, moneyToCents } from "../domain/accounting.js";
import { dateOnlyToDate, dateToDateOnly, formatPeriod, nextPeriod } from "../lib/period.js";
import { parseMoney } from "../lib/serialize.js";
import { withRetry } from "../lib/withRetry.js";
import { generateForAllRules } from "./dashboard.js";
import { buildInstallmentRows } from "./installments.js";
import { generateOccurrences } from "./recurrence.js";
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

/** Today's month in the server time zone. */
function currentPeriod(): string {
  const now = new Date();
  return formatPeriod(now.getFullYear(), now.getMonth() + 1);
}

export async function listBills(db: PrismaClient | Db, month: string): Promise<BillList> {
  const dueDate = {
    gte: dateOnlyToDate(`${month}-01`),
    lt: dateOnlyToDate(`${nextPeriod(month)}-01`),
  };
  const [rec, ins] = await Promise.all([
    db.recurrenceOccurrence.findMany({ where: { dueDate }, include: recInclude }),
    db.installmentOccurrence.findMany({ where: { dueDate }, include: insInclude }),
  ]);
  const items = [...rec.map(recurrenceBill), ...ins.map(installmentBill)].sort(
    (a, b) => a.dueDate.localeCompare(b.dueDate) || a.kind.localeCompare(b.kind) || a.id - b.id,
  );
  let total = 0n;
  let unknownCount = 0;
  for (const b of items) {
    if (b.status !== "planned") continue;
    if (b.expectedAmount === null) unknownCount++;
    else total += moneyToCents(b.expectedAmount);
  }
  return { month, items, plannedTotal: centsToMoney(total), unknownCount };
}

/** The bills list also tops up recurring occurrences, so "A pagar" works without the dashboard. */
export async function getBills(prisma: PrismaClient, month: string): Promise<BillList> {
  await generateForAllRules(prisma, month);
  return listBills(prisma, month);
}

export async function listRules(prisma: PrismaClient): Promise<RuleDto[]> {
  const rows = await prisma.recurrenceRule.findMany({ orderBy: { id: "asc" } });
  return rows.map(ruleDto);
}

export async function createRule(
  prisma: PrismaClient,
  actorId: number,
  input: RecurrenceRuleCreate,
): Promise<BillList> {
  const startPeriod = input.startDate.slice(0, 7);
  const from = startPeriod > currentPeriod() ? startPeriod : currentPeriod();
  const ruleId = await withRetry(() =>
    prisma.$transaction(async (tx) => {
      const payerId = input.payerId ?? actorId;
      await assertActiveUser(tx, payerId, "payerId");
      if (input.ownerId != null) await assertActiveUser(tx, input.ownerId, "ownerId");
      await assertCatalogActive(tx, input);
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
      return rule.id;
    }),
  );
  await generateOccurrences(prisma, ruleId, from);
  return listBills(prisma, from);
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
      await assertCatalogActive(tx, input);
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
      return {
        id: plan.id,
        description: plan.description,
        totalAmount: plan.totalAmount.toFixed(2),
        installmentCount: plan.installmentCount,
        firstDueDate: dateToDateOnly(plan.firstDueDate),
        items: occ.map(installmentBill),
      };
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
  return tx.auditEvent.create({
    data: {
      actorId,
      entityType: before.kind === "recurrence" ? "RecurrenceOccurrence" : "InstallmentOccurrence",
      entityId: String(before.id),
      action,
      before: before as unknown as Prisma.InputJsonValue,
      after: after as unknown as Prisma.InputJsonValue,
      reason,
    },
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
      const amount = input.amount ?? cur.expectedAmount;
      if (amount === null)
        throw invalid("amount", "Amount required: the expected amount is unknown");
      if (cur.categoryId == null) throw invalid("categoryId", "Category required");

      const payerId = input.payerId ?? cur.payerId ?? actorId;
      const accountId = input.accountId !== undefined ? input.accountId : cur.accountId;
      const paymentMethodId =
        input.paymentMethodId !== undefined ? input.paymentMethodId : cur.paymentMethodId;
      if (input.payerId !== undefined) await assertActiveUser(tx, input.payerId, "payerId");
      await assertCatalogActive(tx, {
        ...(input.accountId != null ? { accountId: input.accountId } : {}),
        ...(input.paymentMethodId != null ? { paymentMethodId: input.paymentMethodId } : {}),
      });

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
