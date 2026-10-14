/** A month key "YYYY-MM". */
export type PeriodKey = string;

const PERIOD_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function parsePeriod(key: PeriodKey): { year: number; month: number } {
  const m = PERIOD_RE.exec(key);
  if (!m) throw new Error(`Invalid period key: ${key}`);
  return { year: Number(m[1]), month: Number(m[2]) };
}

export function formatPeriod(year: number, month: number): PeriodKey {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

/** Add n months (n may be negative) to a period key. */
export function addPeriods(key: PeriodKey, n: number): PeriodKey {
  const { year, month } = parsePeriod(key);
  const idx = year * 12 + (month - 1) + n;
  return formatPeriod(Math.floor(idx / 12), (idx % 12) + 1);
}

export function nextPeriod(key: PeriodKey): PeriodKey {
  return addPeriods(key, 1);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Due day inside a period. Day 29-31 becomes the last day of a shorter month. Returns "YYYY-MM-DD". */
export function resolveDueDate(key: PeriodKey, dayOfMonth: number): string {
  if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
    throw new Error(`Invalid day of month: ${dayOfMonth}`);
  }
  const { year, month } = parsePeriod(key);
  const day = Math.min(dayOfMonth, daysInMonth(year, month));
  return `${key}-${String(day).padStart(2, "0")}`;
}

/** "YYYY-MM-DD" to a Date at UTC midnight, the shape Prisma uses for @db.Date. */
export function dateOnlyToDate(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

export function dateToDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}
