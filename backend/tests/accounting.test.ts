import { describe, expect, it } from "vitest";
import {
  centsToMoney,
  moneyToCents,
  netExpenses,
  personalClosingBalance,
  savingsBeforeGoals,
  savingsRate,
  sumCents,
  unallocatedSavings,
} from "../src/domain/accounting.js";

const c = moneyToCents;

describe("guide worked example", () => {
  it("10.000 income, 5.000 expenses, 2x1.000 allowances -> 3.000 savings", () => {
    const savings = savingsBeforeGoals({
      householdIncome: c("10000.00"),
      sharedExpensesNet: c("5000.00"),
      allowanceAllocations: sumCents([c("1000.00"), c("1000.00")]),
    });
    expect(centsToMoney(savings)).toBe("3000.00");
    expect(centsToMoney(unallocatedSavings(savings, 0n))).toBe("3000.00");
    expect(savingsRate(savings, c("10000.00"))).toBe("30.0");
  });
});

describe("refunds", () => {
  it("net expenses drop by the linked refunds", () => {
    expect(centsToMoney(netExpenses(c("5000.00"), c("200.50")))).toBe("4799.50");
  });
  it("a refund raises savings", () => {
    const base = { householdIncome: c("10000.00"), allowanceAllocations: c("2000.00") };
    const s1 = savingsBeforeGoals({ ...base, sharedExpensesNet: c("5000.00") });
    const s2 = savingsBeforeGoals({
      ...base,
      sharedExpensesNet: netExpenses(c("5000.00"), c("100.00")),
    });
    expect(s2 - s1).toBe(c("100.00"));
  });
});

describe("savings rate", () => {
  it("is null when income is 0", () => {
    expect(savingsRate(c("100.00"), 0n)).toBeNull();
    expect(savingsRate(0n, 0n)).toBeNull();
  });
  it("rounds to one decimal, half away from zero", () => {
    expect(savingsRate(c("1.00"), c("8.00"))).toBe("12.5");
    expect(savingsRate(c("1.00"), c("3.00"))).toBe("33.3");
    expect(savingsRate(c("2.00"), c("3.00"))).toBe("66.7");
    expect(savingsRate(c("0.05"), c("100.00"))).toBe("0.1");
  });
  it("can be negative", () => {
    expect(savingsRate(c("-500.00"), c("10000.00"))).toBe("-5.0");
    expect(savingsRate(c("-0.05"), c("100.00"))).toBe("-0.1");
  });
});

describe("personal closing balance", () => {
  it("carries the opening balance and does not reset", () => {
    const closing = personalClosingBalance({
      opening: c("150.00"),
      allowanceAllocations: c("1000.00"),
      personalCredits: c("50.00"),
      personalExpensesNet: c("300.25"),
    });
    expect(centsToMoney(closing)).toBe("899.75");
  });
  it("can go negative and subtracts transfers out", () => {
    const closing = personalClosingBalance({
      opening: 0n,
      allowanceAllocations: c("100.00"),
      personalCredits: 0n,
      personalExpensesNet: c("150.00"),
      transfersOut: c("10.00"),
    });
    expect(centsToMoney(closing)).toBe("-60.00");
  });
});
