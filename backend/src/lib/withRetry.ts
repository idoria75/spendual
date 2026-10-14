const RETRY_MYSQL_CODES = new Set(["1213", "1205"]);

export interface RetryOptions {
  /** Total tries, first one included. Default 3. */
  maxTries?: number;
  /** Wait before the next try, in ms. Default 20 * try number. */
  delayMs?: (tryNumber: number) => number;
}

/** True for MySQL deadlock (1213), lock wait timeout (1205) and Prisma P2034. */
export function isRetryableDbError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as {
    code?: unknown;
    errno?: unknown;
    message?: unknown;
    meta?: { code?: unknown; message?: unknown };
  };
  if (e.code === "P2034") return true;
  for (const c of [e.code, e.errno, e.meta?.code]) {
    if ((typeof c === "string" || typeof c === "number") && RETRY_MYSQL_CODES.has(String(c))) {
      return true;
    }
  }
  const text = `${typeof e.message === "string" ? e.message : ""} ${
    typeof e.meta?.message === "string" ? e.meta.message : ""
  }`;
  return /Deadlock found|Lock wait timeout exceeded|\b(?:code|error|errno):? ?(?:1213|1205)\b/i.test(
    text,
  );
}

/** Run fn. Retry on deadlock or lock timeout. Rethrow the last error after the last try. */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const maxTries = opts.maxTries ?? 3;
  const delayMs = opts.delayMs ?? ((n: number) => 20 * n);
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= maxTries || !isRetryableDbError(err)) throw err;
      const wait = delayMs(attempt);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
  }
}
