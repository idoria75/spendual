import { Router } from "express";
import rateLimit from "express-rate-limit";
import type { PrismaClient } from "@prisma/client";
import {
  loginRequestSchema,
  signupRequestSchema,
  type AuthUser,
  type CsrfResponse,
} from "@spendual/shared";
import { requireCsrf, ensureCsrfToken } from "./csrf.js";
import { AppError, asyncHandler, sendError } from "./errors.js";
import { dummyVerify, hashPassword, verifyPassword } from "./passwords.js";
import { requireAuth, toAuthUser } from "./requireAuth.js";
import {
  SESSION_COOKIE,
  cookieOptions,
  destroySession,
  regenerateSession,
  saveSession,
} from "./session.js";
import { assertHouseholdHasRoom, createUser } from "./signup.js";

export interface LoginLimit {
  windowMs: number;
  max: number;
}

export function authRouter(prisma: PrismaClient, loginLimit: LoginLimit, maxAgeMs: number): Router {
  const router = Router();

  // Failed logins count. Successful ones do not, so normal use never gets blocked.
  const loginLimiter = rateLimit({
    windowMs: loginLimit.windowMs,
    limit: loginLimit.max,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => sendError(res, new AppError(429, "rate_limited", "Too many attempts")),
  });

  router.get("/csrf", ensureCsrfToken, (req, res) => {
    const body: CsrfResponse = { csrfToken: req.session.csrfToken as string };
    res.json(body);
  });

  router.post(
    "/signup",
    requireCsrf,
    asyncHandler(async (req, res) => {
      const input = signupRequestSchema.parse(req.body);
      await assertHouseholdHasRoom(prisma);
      const passwordHash = await hashPassword(input.password);
      const user = await createUser(prisma, {
        username: input.username,
        displayName: input.displayName,
        passwordHash,
      });
      // Signing up also signs in.
      await regenerateSession(req);
      req.session.userId = user.id;
      await saveSession(req);
      const body: AuthUser = toAuthUser(user);
      res.status(201).json(body);
    }),
  );

  router.post(
    "/login",
    requireCsrf,
    loginLimiter,
    asyncHandler(async (req, res) => {
      const input = loginRequestSchema.parse(req.body);
      const user = await prisma.user.findUnique({ where: { username: input.username } });
      let ok = false;
      if (user?.active) ok = await verifyPassword(user.passwordHash, input.password);
      else await dummyVerify(input.password);
      if (!user || !ok)
        throw new AppError(401, "invalid_credentials", "Wrong username or password");
      await regenerateSession(req);
      req.session.userId = user.id;
      await saveSession(req);
      const body: AuthUser = toAuthUser(user);
      res.json(body);
    }),
  );

  router.post(
    "/logout",
    requireCsrf,
    requireAuth(prisma),
    asyncHandler(async (req, res) => {
      await destroySession(req);
      res.clearCookie(SESSION_COOKIE, { ...cookieOptions(maxAgeMs), maxAge: undefined });
      res.status(204).end();
    }),
  );

  router.get("/me", requireAuth(prisma), (req, res) => {
    res.json(req.authUser);
  });

  return router;
}
