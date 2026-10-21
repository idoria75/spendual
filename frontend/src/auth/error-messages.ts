import type { ApiErrorCode } from "@spendual/shared";
import { ApiError } from "../lib/api-client";

/** Each shared ApiErrorCode maps to one pt-BR key in src/i18n/pt-BR.json. */
export const errorMessageKey = {
  validation_error: "errors.validation_error",
  unauthenticated: "errors.unauthenticated",
  invalid_credentials: "errors.invalid_credentials",
  csrf_invalid: "errors.csrf_invalid",
  household_full: "errors.household_full",
  username_taken: "errors.username_taken",
  name_taken: "errors.name_taken",
  rate_limited: "errors.rate_limited",
  not_found: "errors.not_found",
  invalid_state: "errors.invalid_state",
  has_refunds: "errors.has_refunds",
  refund_exceeds: "errors.refund_exceeds",
  allocation_exists: "errors.allocation_exists",
  goal_has_balance: "errors.goal_has_balance",
  insufficient_balance: "errors.insufficient_balance",
  insufficient_savings: "errors.insufficient_savings",
  tone_taken: "errors.tone_taken",
  internal_error: "errors.internal_error",
} as const satisfies Record<ApiErrorCode, string>;

export function messageKeyFor(
  error: unknown,
): (typeof errorMessageKey)[ApiErrorCode] | "errors.network" {
  return error instanceof ApiError ? errorMessageKey[error.code] : "errors.network";
}
