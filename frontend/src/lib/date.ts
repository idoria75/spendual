import { dateOnlySchema, type DateOnly } from "@spendual/shared";

const TIME_ZONE = "America/Sao_Paulo";

const todayParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const weekdayFmt = new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "UTC" });
const monthFmt = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** Today in America/Sao_Paulo as "YYYY-MM-DD". */
export function today(now: Date = new Date()): DateOnly {
  return todayParts.format(now);
}

/** Current month key "YYYY-MM" in America/Sao_Paulo. */
export function currentMonth(now: Date = new Date()): string {
  return today(now).slice(0, 7);
}

function split(date: DateOnly): [string, string, string] {
  const [y = "", m = "", d = ""] = date.split("-");
  return [y, m, d];
}

/** "2026-10-03" -> "03/10/2026" */
export function formatDate(date: DateOnly): string {
  const [y, m, d] = split(date);
  return `${d}/${m}/${y}`;
}

/** "2026-10-03" -> "03/10" */
export function formatDayMonth(date: DateOnly): string {
  const [, m, d] = split(date);
  return `${d}/${m}`;
}

/** "2026-10-03" -> "Sex, 03/10" */
export function formatDayHeader(date: DateOnly): string {
  const [y, m, d] = split(date);
  const wd = weekdayFmt.format(new Date(Date.UTC(Number(y), Number(m) - 1, Number(d))));
  const clean = wd.replace(".", "");
  return `${clean.charAt(0).toUpperCase()}${clean.slice(1)}, ${d}/${m}`;
}

/** "dd/MM/yyyy" typed by a person -> "YYYY-MM-DD", or null when invalid. */
export function parseDateInput(text: string): DateOnly | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim());
  if (!match) return null;
  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  return dateOnlySchema.safeParse(iso).success ? iso : null;
}

/** Add months to a "YYYY-MM" key. */
export function shiftMonth(month: string, delta: number): string {
  const [y = "0", m = "1"] = month.split("-");
  const index = Number(y) * 12 + (Number(m) - 1) + delta;
  const year = Math.floor(index / 12);
  return `${String(year).padStart(4, "0")}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** "2026-10" -> "Outubro 2026" */
export function formatMonth(month: string): string {
  const [y = "0", m = "1"] = month.split("-");
  const text = monthFmt.format(new Date(Date.UTC(Number(y), Number(m) - 1, 1)));
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`.replace(" de ", " ");
}

/** Add days to a "YYYY-MM-DD" date. */
export function addDays(date: DateOnly, days: number): DateOnly {
  const [y = "0", m = "1", d = "1"] = date.split("-");
  const next = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d) + days));
  return next.toISOString().slice(0, 10);
}

const dateTimeParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** ISO instant -> "dd/MM/yyyy HH:mm" in America/Sao_Paulo. */
export function formatDateTime(iso: string): string {
  const p = Object.fromEntries(
    dateTimeParts.formatToParts(new Date(iso)).map((x) => [x.type, x.value]),
  );
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}
