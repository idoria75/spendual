import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { auditQuerySchema } from "@spendual/shared";
import { asyncHandler } from "../auth/errors.js";
import { listAuditLog } from "../services/audit-log.js";

export function auditRouter(prisma: PrismaClient): Router {
  const r = Router();
  r.get(
    "/audit",
    asyncHandler(async (req, res) => {
      res.json(await listAuditLog(prisma, auditQuerySchema.parse(req.query)));
    }),
  );
  return r;
}
