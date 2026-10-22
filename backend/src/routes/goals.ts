import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import {
  goalCreateSchema,
  goalCompleteSchema,
  goalMoveSchema,
  goalPatchSchema,
  type GoalEntryList,
  type GoalList,
  type GoalMove,
} from "@spendual/shared";
import { AppError, asyncHandler } from "../auth/errors.js";
import { MONTHS_AHEAD, MONTHS_BACK, isMonthInWindow } from "../lib/period.js";
import * as goals from "../services/goals.js";
import { actorId, idParam } from "./params.js";

export function goalsRouter(prisma: PrismaClient, clock: () => Date = () => new Date()): Router {
  const r = Router();

  /** Parse a move body. The entry month must be inside the month window. */
  const moveBody = (body: unknown): GoalMove => {
    const input = goalMoveSchema.parse(body);
    if (input.effectiveDate && !isMonthInWindow(input.effectiveDate.slice(0, 7), clock())) {
      throw new AppError(400, "validation_error", "Invalid request", {
        effectiveDate: `Must be within ${MONTHS_BACK} months back and ${MONTHS_AHEAD} ahead`,
      });
    }
    return input;
  };

  r.get(
    "/goals",
    asyncHandler(async (_req, res) => {
      const body: GoalList = { items: await goals.listGoals(prisma) };
      res.json(body);
    }),
  );

  r.post(
    "/goals",
    asyncHandler(async (req, res) => {
      const input = goalCreateSchema.parse(req.body);
      res.status(201).json(await goals.createGoal(prisma, actorId(req), input));
    }),
  );

  r.patch(
    "/goals/:id",
    asyncHandler(async (req, res) => {
      const patch = goalPatchSchema.parse(req.body);
      res.json(await goals.patchGoal(prisma, actorId(req), idParam(req), patch));
    }),
  );

  r.post(
    "/goals/:id/allocations",
    asyncHandler(async (req, res) => {
      const input = moveBody(req.body);
      res
        .status(201)
        .json(await goals.allocate(prisma, actorId(req), idParam(req), input, clock()));
    }),
  );

  r.post(
    "/goals/:id/withdrawals",
    asyncHandler(async (req, res) => {
      const input = moveBody(req.body);
      res
        .status(201)
        .json(await goals.withdraw(prisma, actorId(req), idParam(req), input, clock()));
    }),
  );

  for (const name of ["complete", "reopen", "archive"] as const) {
    r.post(
      `/goals/:id/${name}`,
      asyncHandler(async (req, res) => {
        const opts = name === "complete" ? goalCompleteSchema.parse(req.body ?? {}) : {};
        res.json(
          await goals.transition(prisma, actorId(req), idParam(req), name, {
            ...opts,
            now: clock(),
          }),
        );
      }),
    );
  }

  r.get(
    "/goals/:id/entries",
    asyncHandler(async (req, res) => {
      const body: GoalEntryList = { items: await goals.listEntries(prisma, idParam(req)) };
      res.json(body);
    }),
  );

  return r;
}
