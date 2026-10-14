import express from "express";
import type { PrismaClient } from "@prisma/client";
import { authRouter, type LoginLimit } from "./auth/routes.js";
import { errorHandler } from "./auth/errors.js";
import { SESSION_MAX_AGE_MS, sessionMiddleware } from "./auth/session.js";

export interface AppOptions {
  prisma: PrismaClient;
  sessionSecret: string;
  /** Session and cookie lifetime. Default 7 days. */
  sessionMaxAgeMs?: number;
  /** Failed-login limit per IP. Default 10 per 15 minutes. */
  loginLimit?: LoginLimit;
  /** Seconds between sweeps of expired sessions. Off when unset. */
  sessionCleanupSeconds?: number;
}

export function createApp(opts: AppOptions) {
  const maxAgeMs = opts.sessionMaxAgeMs ?? SESSION_MAX_AGE_MS;
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json());
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  const api = express.Router();
  api.use(
    sessionMiddleware(opts.prisma, {
      secret: opts.sessionSecret,
      maxAgeMs,
      cleanupSeconds: opts.sessionCleanupSeconds,
    }),
  );
  api.use(
    "/auth",
    authRouter(opts.prisma, opts.loginLimit ?? { windowMs: 15 * 60 * 1000, max: 10 }, maxAgeMs),
  );
  app.use("/api", api);

  app.use(errorHandler);
  return app;
}
