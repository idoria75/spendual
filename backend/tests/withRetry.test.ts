import { describe, expect, it } from "vitest";
import { isRetryableDbError, withRetry } from "../src/lib/withRetry.js";

const mysqlError = (code: string) =>
  Object.assign(new Error(`Raw query failed. Code: \`${code}\``), { code: "P2010", meta: { code } });
const noWait = { delayMs: () => 0 };

describe("withRetry", () => {
  it.each(["1213", "1205"])("retries on MySQL error %s and then succeeds", async (code) => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      if (calls < 3) throw mysqlError(code);
      return "ok";
    }, noWait);
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("retries on Prisma P2034", async () => {
    let calls = 0;
    await withRetry(async () => {
      calls++;
      if (calls === 1) throw Object.assign(new Error("conflict"), { code: "P2034" });
    }, noWait);
    expect(calls).toBe(2);
  });

  it.each(["1213", "1205"])("rethrows after the third failure (%s)", async (code) => {
    let calls = 0;
    const err = mysqlError(code);
    await expect(
      withRetry(async () => {
        calls++;
        throw err;
      }, noWait),
    ).rejects.toBe(err);
    expect(calls).toBe(3);
  });

  it("does not retry other errors", async () => {
    let calls = 0;
    await expect(
      withRetry(async () => {
        calls++;
        throw new Error("boom");
      }, noWait),
    ).rejects.toThrow("boom");
    expect(calls).toBe(1);
  });

  it("detects errors by message text too", () => {
    expect(isRetryableDbError(new Error("Deadlock found when trying to get lock"))).toBe(true);
    expect(isRetryableDbError(new Error("Lock wait timeout exceeded; try restarting"))).toBe(true);
    expect(isRetryableDbError(new Error("syntax error"))).toBe(false);
    expect(isRetryableDbError("nope")).toBe(false);
  });
});
