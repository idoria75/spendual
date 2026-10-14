import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import {
  reasonRequestSchema,
  transactionCreateSchema,
  transactionListQuerySchema,
  transactionPatchSchema,
  type AuditEventList,
  type TransactionList,
} from "@spendual/shared";
import { asyncHandler } from "../auth/errors.js";
import * as svc from "../services/transactions.js";
import { actorId, idParam } from "./params.js";

export function transactionsRouter(prisma: PrismaClient): Router {
  const r = Router();

  r.get(
    "/",
    asyncHandler(async (req, res) => {
      const body: TransactionList = {
        items: await svc.listTransactions(prisma, transactionListQuerySchema.parse(req.query)),
      };
      res.json(body);
    }),
  );

  r.post(
    "/",
    asyncHandler(async (req, res) => {
      const input = transactionCreateSchema.parse(req.body);
      res.status(201).json(await svc.createTransaction(prisma, actorId(req), input));
    }),
  );

  r.get(
    "/:id",
    asyncHandler(async (req, res) => {
      res.json(await svc.getTransaction(prisma, idParam(req)));
    }),
  );

  r.patch(
    "/:id",
    asyncHandler(async (req, res) => {
      const id = idParam(req);
      const patch = transactionPatchSchema.parse(req.body);
      res.json(await svc.patchTransaction(prisma, actorId(req), id, patch));
    }),
  );

  r.post(
    "/:id/void",
    asyncHandler(async (req, res) => {
      const id = idParam(req);
      const { reason } = reasonRequestSchema.parse(req.body);
      res.json(await svc.voidTransaction(prisma, actorId(req), id, reason));
    }),
  );

  r.post(
    "/:id/cancel",
    asyncHandler(async (req, res) => {
      const id = idParam(req);
      const { reason } = reasonRequestSchema.parse(req.body);
      res.json(await svc.cancelTransaction(prisma, actorId(req), id, reason));
    }),
  );

  r.get(
    "/:id/audit",
    asyncHandler(async (req, res) => {
      const body: AuditEventList = { items: await svc.listAudit(prisma, idParam(req)) };
      res.json(body);
    }),
  );

  return r;
}
