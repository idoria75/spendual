import type { TrendPoint } from "@spendual/shared";
import { describe, expect, it } from "vitest";
import {
  averageCents,
  averagedPoints,
  axisScale,
  formatRange,
  isOver,
  monthsAbove,
  shortMonth,
  trendWindow,
  wholeReais,
} from "./trend";

const point = (over: Partial<TrendPoint>): TrendPoint => ({
  month: "2026-10",
  amount: "0.00",
  budget: null,
  partial: false,
  ...over,
});

describe("trendWindow", () => {
  it("ends at the selected month and goes back N-1 months", () => {
    expect(trendWindow("2026-10", "2026-10", 6)).toEqual({ from: "2026-05", to: "2026-10" });
    expect(trendWindow("2026-03", "2026-10", 12)).toEqual({ from: "2025-04", to: "2026-03" });
  });
  it("clamps a future month to the current month", () => {
    expect(trendWindow("2027-01", "2026-10", 6)).toEqual({ from: "2026-05", to: "2026-10" });
  });
});

describe("averageCents", () => {
  it("averages closed months and skips the month in progress", () => {
    const pts = [
      point({ amount: "100.00" }),
      point({ amount: "120.00" }),
      point({ amount: "150.00" }),
      point({ amount: "9999.00", partial: true }),
    ];
    expect(averageCents(pts)).toBe(12333n); // 123,33
  });
  it("starts at the first month with spending", () => {
    const pts = [
      point({ amount: "0.00" }),
      point({ amount: "0.00" }),
      point({ amount: "100.00" }),
      point({ amount: "0.00" }),
      point({ amount: "50.00", partial: true }),
    ];
    expect(averagedPoints(pts)).toHaveLength(2);
    expect(averageCents(pts)).toBe(5000n); // 100 and 0 after it, the empty start is left out
    expect(averageCents([point({ amount: "0.00" }), point({ amount: "0.00" })])).toBeNull();
  });
  it("rounds half up and is null without a closed month", () => {
    expect(averageCents([point({ amount: "0.01" }), point({ amount: "0.02" })])).toBe(2n);
    expect(averageCents([point({ amount: "5.00", partial: true })])).toBeNull();
    expect(averageCents([])).toBeNull();
  });
});

describe("budget comparison", () => {
  it("is over only when spent is above the budget of that month", () => {
    expect(isOver(point({ amount: "130.01", budget: "130.00" }))).toBe(true);
    expect(isOver(point({ amount: "130.00", budget: "130.00" }))).toBe(false);
    expect(isOver(point({ amount: "999.00", budget: null }))).toBe(false);
  });
  it("counts closed months over budget out of closed months with a budget", () => {
    const pts = [
      point({ amount: "100.00", budget: "120.00" }),
      point({ amount: "150.00", budget: "130.00" }),
      point({ amount: "10.00", budget: null }),
      point({ amount: "900.00", budget: "130.00", partial: true }),
    ];
    expect(monthsAbove(pts)).toEqual({ above: 1, withBudget: 2 });
  });
});

describe("axisScale", () => {
  it("rounds the top up to a tick step with at most 5 steps", () => {
    expect(axisScale(15000n)).toEqual({ max: 200, step: 50 });
    expect(axisScale(189000n)).toEqual({ max: 2500, step: 500 });
    expect(axisScale(0n)).toEqual({ max: 10, step: 10 });
  });
});

describe("wholeReais", () => {
  it("rounds half away from zero", () => {
    expect(wholeReais(12349n)).toBe(123n);
    expect(wholeReais(12350n)).toBe(124n);
    expect(wholeReais(-12350n)).toBe(-124n);
  });
});

describe("month labels", () => {
  it("shortens the month name", () => {
    expect(shortMonth("2026-05")).toBe("Mai");
    expect(shortMonth("2026-10")).toBe("Out");
  });
  it("shows the year once, or on both ends when they differ", () => {
    expect(formatRange("2026-05", "2026-10")).toBe("Mai – Out 2026");
    expect(formatRange("2025-11", "2026-04")).toBe("Nov 2025 – Abr 2026");
  });
});
