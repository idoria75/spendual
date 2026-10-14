import { Router, type Request } from "express";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import {
  BillKind,
  allowanceCreateSchema,
  billConfirmSchema,
  budgetEditSchema,
  dashboardQuerySchema,
  installmentPlanCreateSchema,
  reasonRequestSchema,
  recurrenceRuleCreateSchema,
  recurrenceRulePatchSchema,
  type RecurrenceRuleList,
} from "@spendual/shared";
import { AppError, asyncHandler } from "../auth/errors.js";
import { MONTHS_AHEAD, MONTHS_BACK, isMonthInWindow } from "../lib/period.js";
import * as bills from "../services/bills.js";
import {
  AllocationExistsError,
  OwnerNotFoundError,
  createAllocation,
} from "../services/allowance.js";
import { editBudget } from "../services/budget.js";
import * as dash from "../services/dashboard.js";
import { assertActiveUser } from "../services/transactions.js";
import { actorId, idParam } from "./params.js";

const monthQuery = dashboardQuerySchema; // every GET here takes only ?month=
const billParams = z.object({ kind: BillKind, id: z.coerce.number().int().positive() });

export function planningRouter(prisma: PrismaClient, clock: () => Date = () => new Date()): Router {
  const r = Router();

  /** ?month= inside the window. Far months would write rows or overflow the year. */
  const month = (req: Request): string => {
    const m = monthQuery.parse(req.query).month;
    if (!isMonthInWindow(m, clock())) {
      throw new AppError(400, "validation_error", "Invalid request", {
        month: `Must be within ${MONTHS_BACK} months back and ${MONTHS_AHEAD} ahead`,
      });
    }
    return m;
  };

  r.get(
    "/dashboard",
    asyncHandler(async (req, res) => {
      res.json(await dash.getDashboard(prisma, month(req), clock()));
    }),
  );

  r.get(
    "/budgets",
    asyncHandler(async (req, res) => {
      res.json(await dash.getBudgetOverview(prisma, month(req)));
    }),
  );

  r.put(
    "/budgets",
    asyncHandler(async (req, res) => {
      const input = budgetEditSchema.parse(req.body);
      await dash.assertBudgetCategory(prisma, input.categoryId);
      await editBudget(prisma, { ...input, actorId: actorId(req) });
      res.json(await dash.getBudgetOverview(prisma, input.period));
    }),
  );

  r.get(
    "/allowances",
    asyncHandler(async (req, res) => {
      res.json(await dash.getAllowanceOverview(prisma, month(req)));
    }),
  );

  r.post(
    "/allowances",
    asyncHandler(async (req, res) => {
      const input = allowanceCreateSchema.parse(req.body);
      try {
        await assertActiveUser(prisma, input.ownerId, "ownerId");
        await createAllocation(prisma, {
          ownerId: input.ownerId,
          periodKey: input.month,
          amount: input.amount,
          actorId: actorId(req),
          notes: input.notes,
        });
      } catch (err) {
        if (err instanceof AllocationExistsError) {
          throw new AppError(409, "allocation_exists", "Allowance already set for this month", {
            ownerId: "Already allocated this month",
          });
        }
        if (err instanceof OwnerNotFoundError) {
          throw new AppError(400, "validation_error", "Invalid request", {
            ownerId: "Unknown user",
          });
        }
        throw err;
      }
      res.status(201).json(await dash.getAllowanceOverview(prisma, input.month));
    }),
  );

  r.get(
    "/bills",
    asyncHandler(async (req, res) => {
      res.json(await bills.getBills(prisma, month(req), clock()));
    }),
  );

  r.post(
    "/recurrence-rules",
    asyncHandler(async (req, res) => {
      const input = recurrenceRuleCreateSchema.parse(req.body);
      res.status(201).json(await bills.createRule(prisma, actorId(req), input, clock()));
    }),
  );

  r.get(
    "/recurrence-rules",
    asyncHandler(async (_req, res) => {
      const body: RecurrenceRuleList = { items: await bills.listRules(prisma) };
      res.json(body);
    }),
  );

  r.patch(
    "/recurrence-rules/:id",
    asyncHandler(async (req, res) => {
      const id = idParam(req);
      const patch = recurrenceRulePatchSchema.parse(req.body);
      res.json(await bills.patchRule(prisma, actorId(req), id, patch));
    }),
  );

  r.post(
    "/installment-plans",
    asyncHandler(async (req, res) => {
      const input = installmentPlanCreateSchema.parse(req.body);
      res.status(201).json(await bills.createInstallmentPlan(prisma, actorId(req), input));
    }),
  );

  r.post(
    "/bills/:kind/:id/confirm",
    asyncHandler(async (req, res) => {
      const { kind, id } = billParams.parse(req.params);
      const input = billConfirmSchema.parse(req.body ?? {});
      res.json(await bills.confirmBill(prisma, actorId(req), kind, id, input));
    }),
  );

  r.post(
    "/bills/:kind/:id/cancel",
    asyncHandler(async (req, res) => {
      const { kind, id } = billParams.parse(req.params);
      const { reason } = reasonRequestSchema.parse(req.body);
      res.json(await bills.cancelBill(prisma, actorId(req), kind, id, reason));
    }),
  );

  return r;
}
