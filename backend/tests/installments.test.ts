import { describe, expect, it } from "vitest";
import {
  buildInstallmentRows,
  centsToMoney,
  moneyToCents,
  splitInstallments,
} from "../src/services/installments.js";

describe("splitInstallments", () => {
  const totals = [
    "0.00",
    "0.01",
    "0.99",
    "1.00",
    "10.00",
    "100.01",
    "999.99",
    "1234.56",
    "99999.97",
  ];

  it("sums to the total exactly for counts 1-60", () => {
    for (const total of totals) {
      for (let count = 1; count <= 60; count++) {
        const parts = splitInstallments(total, count);
        expect(parts).toHaveLength(count);
        const sum = parts.reduce((acc, p) => acc + moneyToCents(p), 0n);
        expect(sum).toBe(moneyToCents(total));
      }
    }
  });

  it("puts the remainder on the last installment", () => {
    expect(splitInstallments("100.00", 3)).toEqual(["33.33", "33.33", "33.34"]);
    expect(splitInstallments("0.01", 3)).toEqual(["0.00", "0.00", "0.01"]);
    expect(splitInstallments("50.00", 1)).toEqual(["50.00"]);
  });

  it("rejects bad input", () => {
    expect(() => splitInstallments("10.00", 0)).toThrow();
    expect(() => splitInstallments("10.00", 1.5)).toThrow();
    expect(() => splitInstallments("-10.00", 2)).toThrow();
    expect(() => splitInstallments("10", 2)).toThrow();
  });

  it("converts cents both ways", () => {
    expect(centsToMoney(moneyToCents("1234.05"))).toBe("1234.05");
    expect(centsToMoney(5n)).toBe("0.05");
  });
});

describe("buildInstallmentRows", () => {
  it("numbers rows from 1 and moves one month each", () => {
    const rows = buildInstallmentRows("300.00", 3, "2026-11-15");
    expect(rows.map((r) => r.sequenceNumber)).toEqual([1, 2, 3]);
    expect(rows.map((r) => r.dueDate)).toEqual(["2026-11-15", "2026-12-15", "2027-01-15"]);
  });

  it("keeps the original day and clamps in short months", () => {
    const rows = buildInstallmentRows("400.00", 4, "2027-01-31");
    expect(rows.map((r) => r.dueDate)).toEqual([
      "2027-01-31",
      "2027-02-28",
      "2027-03-31",
      "2027-04-30",
    ]);
  });
});
