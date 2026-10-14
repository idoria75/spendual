import { Prisma, type PrismaClient } from "@prisma/client";
import { withRetry } from "../lib/withRetry.js";
import { AppError } from "./errors.js";

export const HOUSEHOLD_ID = 1;
export const MAX_USERS = 2;

interface NewUser {
  username: string;
  displayName: string;
  passwordHash: string;
}

/**
 * Lock the single Household row, count users, insert. The row lock makes concurrent signups
 * run one at a time, so the cap holds. Default isolation level on purpose: SERIALIZABLE over
 * an empty table gives gap-lock deadlocks instead of a clean reject.
 */
export function createUser(prisma: PrismaClient, input: NewUser) {
  return withRetry(async () => {
    try {
      return await prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<{ id: number }[]>`
          SELECT id FROM Household WHERE id = ${HOUSEHOLD_ID} FOR UPDATE`;
        if (rows.length === 0) throw new Error("Household row 1 is missing. Run the seed.");
        if ((await tx.user.count()) >= MAX_USERS) {
          throw new AppError(409, "household_full", "Household already has two accounts");
        }
        return tx.user.create({ data: input });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new AppError(409, "username_taken", "Username already taken");
      }
      throw err;
    }
  });
}
