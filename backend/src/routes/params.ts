import type { Request } from "express";
import { z } from "zod";
import { AppError } from "../auth/errors.js";

const idSchema = z.coerce.number().int().positive();

/** Parse :id. A bad value throws ZodError, which the error handler turns into 400. */
export const idParam = (req: Request): number => idSchema.parse(req.params.id);

/** Id of the signed-in user. requireAuth runs first, so this is always set. */
export function actorId(req: Request): number {
  if (!req.authUser) throw new AppError(401, "unauthenticated", "Not signed in");
  return req.authUser.id;
}
