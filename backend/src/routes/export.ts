import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { exportQuerySchema } from "@spendual/shared";
import { asyncHandler } from "../auth/errors.js";
import { transactionsCsv } from "../services/export.js";

export function exportRouter(prisma: PrismaClient, clock: () => Date = () => new Date()): Router {
  const r = Router();
  r.get(
    "/export/transactions.csv",
    asyncHandler(async (req, res) => {
      const csv = await transactionsCsv(prisma, exportQuerySchema.parse(req.query));
      const day = clock().toISOString().slice(0, 10);
      res
        .type("text/csv; charset=utf-8")
        .set("Content-Disposition", `attachment; filename="spendual-lancamentos-${day}.csv"`)
        .set("Cache-Control", "no-store")
        .send(csv);
    }),
  );
  return r;
}
