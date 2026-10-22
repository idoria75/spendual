import { Prisma, type GoalEntry, type PrismaClient, type SavingsGoal } from "@prisma/client";
import type {
  Goal,
  GoalCreate,
  GoalEntry as GoalEntryDto,
  GoalMove,
  GoalPatch,
} from "@spendual/shared";
import { AppError } from "../auth/errors.js";
import { moneyToCents } from "../domain/accounting.js";
import { writeAudit } from "../lib/audit.js";
import { HOUSEHOLD_ID } from "../lib/household.js";
import { currentDate, dateOnlyToDate, dateToDateOnly } from "../lib/period.js";
import { moneyToString } from "../lib/serialize.js";
import { withRetry } from "../lib/withRetry.js";
import { personalClosing, unallocatedForMonth } from "./dashboard.js";

type Db = Prisma.TransactionClient;

const ENTITY = "SavingsGoal";
const ZERO = new Prisma.Decimal(0);

/** Balance = ALLOCATION - WITHDRAWAL + CORRECTION (a correction carries its own sign). */
const signed = (kind: GoalEntry["kind"], amount: Prisma.Decimal): Prisma.Decimal =>
  kind === "WITHDRAWAL" ? amount.neg() : amount;

export async function goalBalance(db: Db | PrismaClient, goalId: number): Promise<Prisma.Decimal> {
  const rows = await db.goalEntry.groupBy({
    by: ["kind"],
    where: { goalId },
    _sum: { amount: true },
  });
  return rows.reduce((acc, r) => acc.add(signed(r.kind, r._sum.amount ?? ZERO)), ZERO);
}

function toGoalDto(
  g: SavingsGoal,
  balance: Prisma.Decimal,
  final: Prisma.Decimal | null = null,
): Goal {
  return {
    id: g.id,
    name: g.name,
    description: g.description,
    targetAmount: g.targetAmount ? moneyToString(g.targetAmount) : null,
    targetDate: g.targetDate ? dateToDateOnly(g.targetDate) : null,
    currency: g.currency,
    status: g.status,
    finalAmount: g.status === "completed" ? moneyToString(g.finalAmount ?? final ?? ZERO) : null,
    ownerId: g.ownerId,
    balance: moneyToString(balance),
    createdById: g.createdById,
    updatedById: g.updatedById,
    createdAt: g.createdAt.toISOString(),
    updatedAt: g.updatedAt.toISOString(),
  };
}

export function toGoalEntryDto(e: GoalEntry): GoalEntryDto {
  return {
    id: e.id,
    goalId: e.goalId,
    kind: e.kind,
    amount: moneyToString(e.amount),
    currency: e.currency,
    effectiveDate: dateToDateOnly(e.effectiveDate),
    actorId: e.actorId,
    notes: e.notes,
    createdAt: e.createdAt.toISOString(),
  };
}

/**
 * Highest balance a goal ever had, by entry date. Stands in for `finalAmount` on goals that were
 * completed before that column existed.
 */
async function peakBalance(db: Db | PrismaClient, goalId: number): Promise<Prisma.Decimal> {
  const rows = await db.goalEntry.findMany({
    where: { goalId },
    orderBy: [{ effectiveDate: "asc" }, { id: "asc" }],
  });
  let running = ZERO;
  let peak = ZERO;
  for (const e of rows) {
    running = running.add(signed(e.kind, e.amount));
    if (running.gt(peak)) peak = running;
  }
  return peak;
}

/** Amount for the DTO of a completed goal that has no `finalAmount` stored. */
const finalFor = (db: Db | PrismaClient, g: SavingsGoal) =>
  g.status === "completed" && g.finalAmount === null
    ? peakBalance(db, g.id)
    : Promise.resolve(null);

/** Lock the goal row until the DB transaction ends. Returns it fresh, or throws 404. */
async function lockGoal(tx: Db, id: number): Promise<SavingsGoal> {
  const rows = await tx.$queryRaw<{ id: number }[]>(
    Prisma.sql`SELECT id FROM SavingsGoal WHERE id = ${id} FOR UPDATE`,
  );
  const row = rows.length > 0 ? await tx.savingsGoal.findUnique({ where: { id } }) : null;
  if (!row) throw new AppError(404, "not_found", "Goal not found");
  return row;
}

/** A personal goal can be read by both people but changed only by its owner. */
function requireOwner(g: SavingsGoal, actorId: number): void {
  if (g.ownerId !== null && g.ownerId !== actorId) {
    throw new AppError(403, "forbidden", "Only the owner can change a personal goal");
  }
}

function requireStatus(g: SavingsGoal, ...allowed: SavingsGoal["status"][]): void {
  if (!allowed.includes(g.status)) {
    throw new AppError(409, "invalid_state", `Goal is ${g.status}`);
  }
}

const snapshot = (g: SavingsGoal, balance: Prisma.Decimal): Prisma.InputJsonValue => ({
  ...toGoalDto(g, balance),
});

export async function listGoals(prisma: PrismaClient): Promise<Goal[]> {
  const [goals, sums] = await Promise.all([
    prisma.savingsGoal.findMany({ orderBy: { id: "desc" } }),
    prisma.goalEntry.groupBy({ by: ["goalId", "kind"], _sum: { amount: true } }),
  ]);
  const balances = new Map<number, Prisma.Decimal>();
  for (const s of sums) {
    const cur = balances.get(s.goalId) ?? ZERO;
    balances.set(s.goalId, cur.add(signed(s.kind, s._sum.amount ?? ZERO)));
  }
  return Promise.all(
    goals.map(async (g) => toGoalDto(g, balances.get(g.id) ?? ZERO, await finalFor(prisma, g))),
  );
}

export async function getGoal(prisma: PrismaClient, id: number): Promise<Goal> {
  const g = await prisma.savingsGoal.findUnique({ where: { id } });
  if (!g) throw new AppError(404, "not_found", "Goal not found");
  return toGoalDto(g, await goalBalance(prisma, id), await finalFor(prisma, g));
}

export async function listEntries(prisma: PrismaClient, id: number): Promise<GoalEntryDto[]> {
  const g = await prisma.savingsGoal.findUnique({ where: { id }, select: { id: true } });
  if (!g) throw new AppError(404, "not_found", "Goal not found");
  const rows = await prisma.goalEntry.findMany({
    where: { goalId: id },
    orderBy: [{ effectiveDate: "desc" }, { id: "desc" }],
  });
  return rows.map(toGoalEntryDto);
}

export function createGoal(
  prisma: PrismaClient,
  actorId: number,
  input: GoalCreate,
): Promise<Goal> {
  return withRetry(() =>
    prisma.$transaction(async (tx) => {
      const row = await tx.savingsGoal.create({
        data: {
          name: input.name,
          description: input.description ?? null,
          targetAmount: input.targetAmount ?? null,
          targetDate: input.targetDate ? dateOnlyToDate(input.targetDate) : null,
          ownerId: input.personal ? actorId : null,
          createdById: actorId,
          updatedById: actorId,
        },
      });
      await writeAudit(tx, {
        actorId,
        entityType: ENTITY,
        entityId: row.id,
        action: "goal.create",
        after: snapshot(row, ZERO),
      });
      return toGoalDto(row, ZERO);
    }),
  );
}

export function patchGoal(
  prisma: PrismaClient,
  actorId: number,
  id: number,
  patch: GoalPatch,
): Promise<Goal> {
  return withRetry(() =>
    prisma.$transaction(async (tx) => {
      const cur = await lockGoal(tx, id);
      requireOwner(cur, actorId);
      requireStatus(cur, "active", "completed");
      const balance = await goalBalance(tx, id);
      const row = await tx.savingsGoal.update({
        where: { id },
        data: {
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          ...(patch.targetAmount !== undefined ? { targetAmount: patch.targetAmount } : {}),
          ...(patch.targetDate !== undefined
            ? { targetDate: patch.targetDate ? dateOnlyToDate(patch.targetDate) : null }
            : {}),
          updatedById: actorId,
        },
      });
      await writeAudit(tx, {
        actorId,
        entityType: ENTITY,
        entityId: id,
        action: "goal.update",
        before: snapshot(cur, balance),
        after: snapshot(row, balance),
      });
      return toGoalDto(row, balance, await finalFor(tx, row));
    }),
  );
}

/** Allocate or withdraw. A withdrawal checks the balance under the goal row lock. */
function move(kind: "ALLOCATION" | "WITHDRAWAL") {
  return (
    prisma: PrismaClient,
    actorId: number,
    id: number,
    input: GoalMove,
    now: Date = new Date(),
  ): Promise<Goal> =>
    withRetry(() =>
      prisma.$transaction(async (tx) => {
        // Locking reads only: a plain read first would fix the snapshot before the pool lock,
        // and the free-savings check below would then miss an allocation that just committed.
        const locked = await tx.$queryRaw<{ id: number; ownerId: number | null }[]>(
          Prisma.sql`SELECT id, ownerId FROM SavingsGoal WHERE id = ${id} FOR UPDATE`,
        );
        // Allocations of different goals share one pool of savings: serialize them on the
        // household row. A personal goal draws on its owner's balance: serialize on that user.
        const first = locked[0];
        if (kind === "ALLOCATION" && first) {
          await tx.$queryRaw(
            first.ownerId === null
              ? Prisma.sql`SELECT id FROM Household WHERE id = ${HOUSEHOLD_ID} FOR UPDATE`
              : Prisma.sql`SELECT id FROM User WHERE id = ${first.ownerId} FOR UPDATE`,
          );
        }
        const cur = await lockGoal(tx, id);
        requireOwner(cur, actorId);
        requireStatus(cur, "active");
        const amount = new Prisma.Decimal(input.amount);
        const effectiveDate = input.effectiveDate ?? currentDate(now);
        if (kind === "ALLOCATION" && cur.ownerId !== null) {
          const free = await personalClosing(tx, cur.ownerId, effectiveDate.slice(0, 7));
          if (moneyToCents(amount.toFixed(2)) > free) {
            throw new AppError(
              409,
              "insufficient_personal",
              "Deposit is above the personal balance",
              { amount: "Above the personal balance" },
            );
          }
        } else if (kind === "ALLOCATION") {
          const free = await unallocatedForMonth(tx, effectiveDate.slice(0, 7));
          if (moneyToCents(amount.toFixed(2)) > free) {
            throw new AppError(
              409,
              "insufficient_savings",
              "Allocation is above the unallocated savings",
              {
                amount: "Above the unallocated savings",
              },
            );
          }
        }
        const before = await goalBalance(tx, id);
        if (kind === "WITHDRAWAL" && amount.gt(before)) {
          throw new AppError(409, "insufficient_balance", "Withdrawal is above the goal balance", {
            amount: "Above the goal balance",
          });
        }
        await tx.goalEntry.create({
          data: {
            goalId: id,
            kind,
            amount,
            currency: cur.currency,
            effectiveDate: dateOnlyToDate(effectiveDate),
            actorId,
            notes: input.notes ?? null,
          },
        });
        const after = kind === "ALLOCATION" ? before.add(amount) : before.sub(amount);
        await writeAudit(tx, {
          actorId,
          entityType: ENTITY,
          entityId: id,
          action: kind === "ALLOCATION" ? "goal.allocate" : "goal.withdraw",
          before: { balance: moneyToString(before) },
          after: { balance: moneyToString(after), amount: moneyToString(amount) },
        });
        return toGoalDto(cur, after);
      }),
    );
}

export const allocate = move("ALLOCATION");
export const withdraw = move("WITHDRAWAL");

type Transition = "complete" | "reopen" | "archive";

const TRANSITIONS: Record<
  Transition,
  { from: SavingsGoal["status"][]; to: SavingsGoal["status"]; needsZero: boolean }
> = {
  complete: { from: ["active"], to: "completed", needsZero: true },
  reopen: { from: ["completed"], to: "active", needsZero: false },
  archive: { from: ["active", "completed"], to: "archived", needsZero: true },
};

export function transition(
  prisma: PrismaClient,
  actorId: number,
  id: number,
  name: Transition,
  opts: { withdrawAll?: boolean; now?: Date } = {},
): Promise<Goal> {
  const t = TRANSITIONS[name];
  return withRetry(() =>
    prisma.$transaction(async (tx) => {
      const cur = await lockGoal(tx, id);
      requireOwner(cur, actorId);
      requireStatus(cur, ...t.from);
      let balance = await goalBalance(tx, id);
      // Completing can return the money in the same step. The amount reached is kept apart.
      let reached: Prisma.Decimal | null = null;
      if (name === "complete" && opts.withdrawAll && balance.gt(ZERO)) {
        reached = balance;
        await tx.goalEntry.create({
          data: {
            goalId: id,
            kind: "WITHDRAWAL",
            amount: balance,
            currency: cur.currency,
            effectiveDate: dateOnlyToDate(currentDate(opts.now)),
            actorId,
            notes: "Meta concluída",
          },
        });
        balance = ZERO;
      }
      if (t.needsZero && !balance.isZero()) {
        throw new AppError(409, "goal_has_balance", "Goal still has money", {
          balance: moneyToString(balance),
        });
      }
      const finalAmount =
        name === "complete"
          ? (reached ?? (await peakBalance(tx, id)))
          : name === "reopen"
            ? null
            : undefined;
      const row = await tx.savingsGoal.update({
        where: { id },
        data: {
          status: t.to,
          updatedById: actorId,
          ...(finalAmount !== undefined ? { finalAmount } : {}),
        },
      });
      await writeAudit(tx, {
        actorId,
        entityType: ENTITY,
        entityId: id,
        action: `goal.${name}`,
        before: snapshot(cur, balance),
        after: snapshot(row, balance),
      });
      return toGoalDto(row, balance);
    }),
  );
}
