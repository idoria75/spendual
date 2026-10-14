import { z } from "zod";

/**
 * Auth contract (Phase 2). Routes, all under /api:
 *   GET  /auth/csrf    -> 200 CsrfResponse         (no session needed)
 *   POST /auth/signup  -> 201 AuthUser             body SignupRequest, needs X-CSRF-Token
 *   POST /auth/login   -> 200 AuthUser             body LoginRequest, needs X-CSRF-Token
 *   POST /auth/logout  -> 204                      needs session + X-CSRF-Token
 *   GET  /auth/me      -> 200 AuthUser | 401
 * Errors: ApiError with HTTP 400, 401, 403, 409, 429.
 */
export const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(60)
  .regex(/^[a-zA-Z0-9._-]+$/);
export const passwordSchema = z.string().min(10).max(200);

export const signupRequestSchema = z.object({
  username: usernameSchema,
  displayName: z.string().trim().min(1).max(80),
  password: passwordSchema,
});
export type SignupRequest = z.infer<typeof signupRequestSchema>;

export const loginRequestSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const authUserSchema = z.object({
  id: z.number().int(),
  username: z.string(),
  displayName: z.string(),
  tonePalette: z.string().nullable(),
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const csrfResponseSchema = z.object({ csrfToken: z.string() });
export type CsrfResponse = z.infer<typeof csrfResponseSchema>;

/** Stable machine codes. The UI maps each code to a pt-BR message. */
export const ApiErrorCode = z.enum([
  "validation_error",
  "unauthenticated",
  "invalid_credentials",
  "csrf_invalid",
  "household_full",
  "username_taken",
  "rate_limited",
  "internal_error",
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCode>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: ApiErrorCode,
    message: z.string(),
    fields: z.record(z.string(), z.string()).optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
