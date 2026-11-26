import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from "express";
import { ZodError } from "zod";
import type { ApiError, ApiErrorCode } from "@spendual/shared";

/** An error that maps straight to an ApiError reply. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export function sendError(res: Response, err: AppError): void {
  const body: ApiError = {
    error: { code: err.code, message: err.message, ...(err.fields ? { fields: err.fields } : {}) },
  };
  res.status(err.status).json(body);
}

export function zodFields(err: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_";
    fields[key] ??= issue.message;
  }
  return fields;
}

/** Express 4 does not catch rejected promises. This forwards them to the error handler. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

export const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  if (err instanceof AppError) {
    sendError(res, err);
  } else if (err instanceof ZodError) {
    sendError(res, new AppError(400, "validation_error", "Invalid request", zodFields(err)));
  } else if ((err as { type?: unknown } | null)?.type === "entity.parse.failed") {
    sendError(res, new AppError(400, "validation_error", "Invalid JSON body"));
  } else {
    console.error(err);
    sendError(res, new AppError(500, "internal_error", "Internal error"));
  }
};
