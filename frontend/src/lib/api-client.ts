import { apiErrorSchema, csrfResponseSchema, type ApiErrorCode } from "@spendual/shared";
import type { ZodType, ZodTypeDef } from "zod";

/** Any schema whose output is T. The input may differ (a field with a default). */
type ApiSchema<T> = ZodType<T, ZodTypeDef, unknown>;

const BASE = "/api";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly fields: Record<string, string> | undefined;

  constructor(
    status: number,
    code: ApiErrorCode,
    message: string,
    fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

let csrfToken: string | null = null;

/** Forget the cached CSRF token (used by tests). */
export function resetCsrfToken(): void {
  csrfToken = null;
}

async function toApiError(res: Response): Promise<ApiError> {
  const json: unknown = await res.json().catch(() => null);
  const parsed = apiErrorSchema.safeParse(json);
  if (parsed.success) {
    const { code, message, fields } = parsed.data.error;
    return new ApiError(res.status, code, message, fields);
  }
  return new ApiError(res.status, "internal_error", res.statusText);
}

async function getCsrfToken(): Promise<string> {
  if (csrfToken) return csrfToken;
  const res = await fetch(`${BASE}/auth/csrf`, { credentials: "include" });
  if (!res.ok) throw await toApiError(res);
  csrfToken = csrfResponseSchema.parse(await res.json()).csrfToken;
  return csrfToken;
}

interface RequestOptions<T> {
  body?: unknown;
  /** Schema for the response body. Omit for 204 responses. */
  schema?: ApiSchema<T>;
}

async function send(method: string, path: string, body: unknown): Promise<Response> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (!SAFE_METHODS.has(method)) headers["X-CSRF-Token"] = await getCsrfToken();
  return fetch(`${BASE}${path}`, {
    method,
    credentials: "include",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function request<T = void>(
  method: string,
  path: string,
  options: RequestOptions<T> = {},
): Promise<T> {
  let res = await send(method, path, options.body);
  if (!res.ok) {
    let error = await toApiError(res);
    if (error.code === "csrf_invalid" && !SAFE_METHODS.has(method)) {
      // The session may have changed: fetch a new token and try once more.
      csrfToken = null;
      res = await send(method, path, options.body);
      if (res.ok) return parse(res, options.schema);
      error = await toApiError(res);
    }
    throw error;
  }
  return parse(res, options.schema);
}

async function parse<T>(res: Response, schema?: ApiSchema<T>): Promise<T> {
  if (res.status === 204 || !schema) return undefined as T;
  return schema.parse(await res.json());
}

export const api = {
  get: <T>(path: string, schema: ApiSchema<T>) => request("GET", path, { schema }),
  post: <T = void>(path: string, body?: unknown, schema?: ApiSchema<T>) =>
    request("POST", path, { body, ...(schema ? { schema } : {}) }),
  put: <T = void>(path: string, body?: unknown, schema?: ApiSchema<T>) =>
    request("PUT", path, { body, ...(schema ? { schema } : {}) }),
  patch: <T = void>(path: string, body?: unknown, schema?: ApiSchema<T>) =>
    request("PATCH", path, { body, ...(schema ? { schema } : {}) }),
  delete: <T = void>(path: string, schema?: ApiSchema<T>) =>
    request("DELETE", path, schema ? { schema } : {}),
};
