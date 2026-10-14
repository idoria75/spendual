import { describe, expect, it } from "vitest";
import { dateOnlySchema, moneySchema } from "./index";

describe("moneySchema", () => {
  it.each(["0.00", "12.50", "-3.99", "9999999999.99"])("accepts %s", (v) => {
    expect(moneySchema.safeParse(v).success).toBe(true);
  });
  it.each(["1", "1.5", "1.234", "1,50", "+1.00", "", "12345678901.00", " 1.00"])("rejects %s", (v) => {
    expect(moneySchema.safeParse(v).success).toBe(false);
  });
  it("rejects numbers", () => {
    expect(moneySchema.safeParse(1.5).success).toBe(false);
  });
});

describe("dateOnlySchema", () => {
  it.each(["2026-10-14", "2024-02-29"])("accepts %s", (v) => {
    expect(dateOnlySchema.safeParse(v).success).toBe(true);
  });
  it.each(["2026-13-01", "2025-02-29", "2026-1-1", "14/10/2026", "2026-10-14T00:00:00Z"])("rejects %s", (v) => {
    expect(dateOnlySchema.safeParse(v).success).toBe(false);
  });
});
