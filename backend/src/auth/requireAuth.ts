import type { RequestHandler } from "express";
import type { PrismaClient, User } from "@prisma/client";
import type { AuthUser } from "@spendual/shared";
import { AppError, asyncHandler } from "./errors.js";
import { destroySession } from "./session.js";

declare module "express-serve-static-core" {
  interface Request {
    /** Set by requireAuth. */
    authUser?: AuthUser;
  }
}

/** Only these fields ever leave the server. Never spread a User row into a response. */
export function toAuthUser(u: Pick<User, "id" | "username" | "displayName" | "tonePalette">) {
  return { id: u.id, username: u.username, displayName: u.displayName, tonePalette: u.tonePalette };
}

/** 401 unless the session holds a user that still exists and is active. */
export function requireAuth(prisma: PrismaClient): RequestHandler {
  return asyncHandler(async (req, _res, next) => {
    const userId = req.session.userId;
    const user = userId ? await prisma.user.findUnique({ where: { id: userId } }) : null;
    if (!user || !user.active) {
      if (userId) await destroySession(req);
      throw new AppError(401, "unauthenticated", "Not signed in");
    }
    req.authUser = toAuthUser(user);
    next();
  });
}
