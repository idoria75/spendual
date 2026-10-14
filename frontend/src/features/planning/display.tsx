import type { Money } from "@spendual/shared";
import { useTranslation } from "react-i18next";
import { formatMoney, type AmountSign } from "../../lib/currency";

/** A known amount, or `valor ?` when the API sends null. Never `R$ 0,00` for unknown. */
export function MoneyOrUnknown({
  value,
  sign = "none",
}: {
  value: Money | null;
  sign?: AmountSign;
}) {
  const { t } = useTranslation();
  if (value === null) return <span className="text-muted">{t("bills.unknown")}</span>;
  return <>{formatMoney(value, sign)}</>;
}

/** Percent of `part` in `whole` as a number 0..n, from money strings. Whole 0 gives 0. */
export function percentOf(part: bigint, whole: bigint): number {
  if (whole <= 0n) return 0;
  return Number((part * 10000n) / whole) / 100;
}

/** "12.5" -> "12,5%". null -> "—". */
export function formatRate(rate: string | null): string {
  if (rate === null) return "—";
  return `${rate.replace(".", ",")}%`;
}

/** Progress bar: track + solid segment. Over 100 percent turns warn. */
export function Bar({
  percent,
  over,
  color,
  label,
}: {
  percent: number;
  over: boolean;
  color?: string;
  label: string;
}) {
  const width = Math.min(100, Math.max(0, percent));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(Math.min(100, percent))}
      className="h-2 w-full overflow-hidden rounded-chip bg-surface-2"
    >
      <div
        className={over ? "h-full bg-warn" : "h-full bg-accent"}
        style={{ width: `${width}%`, ...(color && !over ? { background: color } : {}) }}
      />
    </div>
  );
}
