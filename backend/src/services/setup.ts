import type { PrismaClient } from "@prisma/client";
import type { SetupStatus } from "@spendual/shared";
import { HOUSEHOLD_ID } from "../lib/household.js";

export async function getSetupStatus(prisma: PrismaClient): Promise<SetupStatus> {
  const h = await prisma.household.findUnique({
    where: { id: HOUSEHOLD_ID },
    select: { setupCompletedAt: true },
  });
  return { completed: h?.setupCompletedAt != null };
}

/** Idempotent: the first call stamps the time, later calls keep it. */
export async function completeSetup(prisma: PrismaClient): Promise<SetupStatus> {
  const { count } = await prisma.household.updateMany({
    where: { id: HOUSEHOLD_ID, setupCompletedAt: null },
    data: { setupCompletedAt: new Date() },
  });
  if (count === 0 && !(await prisma.household.findUnique({ where: { id: HOUSEHOLD_ID } }))) {
    throw new Error("Household row 1 is missing. Run the seed.");
  }
  return getSetupStatus(prisma);
}
