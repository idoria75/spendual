import { createHash, timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
import { AppError } from "./errors.js";
import { newCsrfToken } from "./session.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Compare through SHA-256 so both buffers have the same length. */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** Return the session token, creating it on first use. */
export const ensureCsrfToken: RequestHandler = (req, _res, next) => {
  req.session.csrfToken ??= newCsrfToken();
  next();
};

/** Synchronizer token check on every state-changing request. */
export const requireCsrf: RequestHandler = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }
  const expected = req.session.csrfToken;
  const given = req.get("x-csrf-token");
  if (!expected || !given || !safeEqual(expected, given)) {
    next(new AppError(403, "csrf_invalid", "Invalid CSRF token"));
    return;
  }
  next();
};
