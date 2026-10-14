import {
  currentMonth,
  formatDate,
  formatDayHeader,
  formatDayMonth,
  formatMonth,
  parseDateInput,
  shiftMonth,
  today,
} from "./date";

it("formats dates", () => {
  expect(formatDate("2026-10-03")).toBe("03/10/2026");
  expect(formatDayMonth("2026-10-03")).toBe("03/10");
  expect(formatDayHeader("2026-10-02")).toBe("Sex, 02/10");
  expect(formatDayHeader("2026-10-03")).toBe("Sáb, 03/10");
});

it("uses the Sao Paulo day, not UTC", () => {
  // 01:00 UTC is still the previous evening in Sao Paulo (UTC-3).
  expect(today(new Date("2026-10-04T01:00:00Z"))).toBe("2026-10-03");
  expect(currentMonth(new Date("2026-11-01T01:00:00Z"))).toBe("2026-10");
});

it("parses typed dates", () => {
  expect(parseDateInput("03/10/2026")).toBe("2026-10-03");
  expect(parseDateInput("31/02/2026")).toBeNull();
  expect(parseDateInput("3/10/2026")).toBeNull();
});

it("shifts and formats months", () => {
  expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  expect(formatMonth("2026-10")).toBe("Outubro 2026");
});
