import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import {
  accountInputSchema,
  accountPatchSchema,
  categoryInputSchema,
  categoryPatchSchema,
  paymentMethodInputSchema,
  paymentMethodPatchSchema,
} from "@spendual/shared";
import { asyncHandler } from "../auth/errors.js";
import * as svc from "../services/catalog.js";
import { idParam } from "./params.js";

export function catalogRouter(prisma: PrismaClient): Router {
  const r = Router();

  r.get(
    "/lookups",
    asyncHandler(async (_req, res) => {
      res.json(await svc.getLookups(prisma));
    }),
  );

  r.post(
    "/categories",
    asyncHandler(async (req, res) => {
      res.status(201).json(await svc.createCategory(prisma, categoryInputSchema.parse(req.body)));
    }),
  );
  r.patch(
    "/categories/:id",
    asyncHandler(async (req, res) => {
      const body = categoryPatchSchema.parse(req.body);
      res.json(await svc.updateCategory(prisma, idParam(req), body));
    }),
  );

  r.post(
    "/accounts",
    asyncHandler(async (req, res) => {
      res.status(201).json(await svc.createAccount(prisma, accountInputSchema.parse(req.body)));
    }),
  );
  r.patch(
    "/accounts/:id",
    asyncHandler(async (req, res) => {
      const body = accountPatchSchema.parse(req.body);
      res.json(await svc.updateAccount(prisma, idParam(req), body));
    }),
  );

  r.post(
    "/payment-methods",
    asyncHandler(async (req, res) => {
      const body = paymentMethodInputSchema.parse(req.body);
      res.status(201).json(await svc.createPaymentMethod(prisma, body));
    }),
  );
  r.patch(
    "/payment-methods/:id",
    asyncHandler(async (req, res) => {
      const body = paymentMethodPatchSchema.parse(req.body);
      res.json(await svc.updatePaymentMethod(prisma, idParam(req), body));
    }),
  );

  return r;
}
