import { Router } from "express";
import { Prisma, type PrismaClient } from "@prisma/client";
import { profilePatchSchema, type AuthUser } from "@spendual/shared";
import { AppError, asyncHandler } from "../auth/errors.js";
import { toAuthUser } from "../auth/requireAuth.js";
import { readBackupStatus } from "../services/backup.js";

const toneTaken = () => new AppError(409, "tone_taken", "Tone already used by the other user");

export function settingsRouter(prisma: PrismaClient, backupDir: string | undefined): Router {
  const r = Router();

  r.patch(
    "/me",
    asyncHandler(async (req, res) => {
      const patch = profilePatchSchema.parse(req.body);
      const me = (req.authUser as AuthUser).id;
      if (patch.tonePalette) {
        const other = await prisma.user.findFirst({
          where: { tonePalette: patch.tonePalette, id: { not: me } },
          select: { id: true },
        });
        if (other) throw toneTaken();
      }
      try {
        const user = await prisma.user.update({
          where: { id: me },
          data: {
            displayName: patch.displayName,
            tonePalette: patch.tonePalette,
            theme: patch.theme,
          },
        });
        const body: AuthUser = toAuthUser(user);
        res.json(body);
      } catch (err) {
        // The UNIQUE on tonePalette wins a race that the pre-check missed.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          throw toneTaken();
        }
        throw err;
      }
    }),
  );

  r.get(
    "/backup/status",
    asyncHandler(async (_req, res) => {
      res.json(await readBackupStatus(backupDir));
    }),
  );

  return r;
}
