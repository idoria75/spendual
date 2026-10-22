import path from "node:path";
import express, { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { authRouter, type LoginLimit } from "./auth/routes.js";
import { requireCsrf } from "./auth/csrf.js";
import { errorHandler } from "./auth/errors.js";
import { requireAuth } from "./auth/requireAuth.js";
import { auditRouter } from "./routes/audit.js";
import { catalogRouter } from "./routes/catalog.js";
import { goalsRouter } from "./routes/goals.js";
import { planningRouter } from "./routes/planning.js";
import { settingsRouter } from "./routes/settings.js";
import { transactionsRouter } from "./routes/transactions.js";
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
  /** Clock for month windows and generation. Tests inject a fixed one. */
  now?: () => Date;
  /** Directory that holds backup files. Backup status reports not configured when unset. */
  backupDir?: string;
  /** Express `trust proxy` value (hop count, "loopback", CIDR list). Off when unset. */
  trustProxy?: number | string | boolean;
  /** Folder with the built frontend. When set, it is served with an SPA fallback. */
  staticDir?: string;
}

export function createApp(opts: AppOptions) {
  const maxAgeMs = opts.sessionMaxAgeMs ?? SESSION_MAX_AGE_MS;
  const app = express();
  app.disable("x-powered-by");
  // Behind a reverse proxy the client IP comes from X-Forwarded-For. Off by default: with it on
  // and no proxy, a client could fake its IP and dodge the login rate limit.
  if (opts.trustProxy !== undefined) app.set("trust proxy", opts.trustProxy);
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
  // Everything below needs a session. State-changing requests also need the CSRF token.
  const protectedApi = Router();
  protectedApi.use(requireAuth(opts.prisma), requireCsrf);
  protectedApi.use(catalogRouter(opts.prisma));
  protectedApi.use(settingsRouter(opts.prisma, opts.backupDir));
  protectedApi.use(planningRouter(opts.prisma, opts.now));
  protectedApi.use(goalsRouter(opts.prisma, opts.now));
  protectedApi.use(auditRouter(opts.prisma));
  protectedApi.use("/transactions", transactionsRouter(opts.prisma));
  api.use(protectedApi);
  app.use("/api", api);
  // Unknown API paths are a JSON 404, never the frontend page.
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: { code: "not_found", message: "Not found" } });
  });

  if (opts.staticDir) {
    const dir = path.resolve(opts.staticDir);
    // Vite file names carry a content hash, so /assets can be cached for a long time.
    app.use("/assets", express.static(path.join(dir, "assets"), { immutable: true, maxAge: "1y" }));
    // A missing asset is a 404, not the page: a stale hashed file must not parse as HTML.
    app.use("/assets", (_req, res) => res.status(404).end());
    app.use(express.static(dir, { index: false }));
    app.get("*", (req, res, next) => {
      // A path with a file extension (favicon.ico, robots.txt) is a missing file, not a page.
      if (path.extname(req.path)) return next();
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(path.join(dir, "index.html"));
    });
  }

  app.use(errorHandler);
  return app;
}
