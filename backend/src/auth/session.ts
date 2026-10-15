import { randomBytes } from "node:crypto";
import type { Request, RequestHandler } from "express";
import session from "express-session";
import { PrismaSessionStore } from "@quixo3/prisma-session-store";
import type { PrismaClient } from "@prisma/client";

declare module "express-session" {
  interface SessionData {
    userId?: number;
    csrfToken?: string;
  }
}

export const SESSION_COOKIE = "spendual.sid";
export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function cookieOptions(maxAgeMs: number) {
  return { httpOnly: true, sameSite: "lax", secure: false, path: "/", maxAge: maxAgeMs } as const;
}

export interface SessionOptions {
  secret: string;
  maxAgeMs?: number;
  /** Seconds between sweeps of expired rows. Off when unset. */
  cleanupSeconds?: number;
}

export function sessionMiddleware(prisma: PrismaClient, opts: SessionOptions): RequestHandler {
  const maxAgeMs = opts.maxAgeMs ?? SESSION_MAX_AGE_MS;
  return session({
    name: SESSION_COOKIE,
    secret: opts.secret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: cookieOptions(maxAgeMs),
    store: new PrismaSessionStore(prisma, {
      dbRecordIdIsSessionId: true,
      checkPeriod: opts.cleanupSeconds ? opts.cleanupSeconds * 1000 : undefined,
    }),
  });
}

export const newCsrfToken = (): string => randomBytes(32).toString("base64url");

const call = (fn: (cb: (err?: unknown) => void) => void): Promise<void> =>
  new Promise((resolve, reject) =>
    fn((err) =>
      err
        ? reject(err instanceof Error ? err : new Error("Session store error", { cause: err }))
        : resolve(),
    ),
  );

export const saveSession = (req: Request) => call((cb) => req.session.save(cb));
export const destroySession = (req: Request) => call((cb) => req.session.destroy(cb));

/** New session id (blocks fixation). Keeps the CSRF token so the client need not refetch it. */
export async function regenerateSession(req: Request): Promise<void> {
  const csrfToken = req.session.csrfToken;
  await call((cb) => req.session.regenerate(cb));
  if (csrfToken) req.session.csrfToken = csrfToken;
}
