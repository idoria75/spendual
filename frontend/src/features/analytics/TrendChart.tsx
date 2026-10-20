import type { TrendPoint } from "@spendual/shared";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { formatMoney, fromCents, toCents } from "../../lib/currency";
import { averageCents, axisScale, isOver, shortMonth, wholeReais } from "./trend";

const W = 340;
const H = 230;
const M = { l: 44, r: 8, t: 22, b: 26 };
/** Value labels above the bars fit up to this many months. */
const LABEL_LIMIT = 7;

const axisFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

/**
 * Vertical bars per month, a dashed average line and a gray budget line that steps when the
 * budget changed. Plain SVG, one scale for every mark (ui-guidelines §6.5).
 * The month in progress is hatched and left out of the average.
 */
export function TrendChart({
  points,
  color,
  label,
}: {
  points: TrendPoint[];
  color: string;
  label: string;
}) {
  const { t } = useTranslation();
  const hatchId = useId();
  const avg = averageCents(points);
  const amounts = points.map((p) => toCents(p.amount));
  const budgets = points.flatMap((p) => (p.budget === null ? [] : [toCents(p.budget)]));
  const top = [...amounts, ...budgets, avg ?? 0n].reduce((a, b) => (b > a ? b : a), 0n);
  const { max, step } = axisScale(top);
  const maxCents = BigInt(max) * 100n;
  const iw = W - M.l - M.r;
  const ih = H - M.t - M.b;
  const band = iw / points.length;
  const bw = Math.min(band * 0.58, 44);
  // Position on the scale from integer math; only the final ratio is a float.
  const y = (cents: bigint) => M.t + ih - (Number((cents * 10000n) / maxCents) / 10000) * ih;
  const ticks = Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step);
  const showValues = points.length <= LABEL_LIMIT;

  const budgetPath = points
    .map((p, i) => {
      if (p.budget === null) return "";
      const x0 = M.l + i * band;
      const yy = y(toCents(p.budget));
      return `M${x0} ${yy} L${x0 + band} ${yy}`;
    })
    .filter(Boolean)
    .join(" ");
  // Join neighbours that both have a budget with a vertical step.
  const stepPath = points
    .map((p, i) => {
      const prev = points[i - 1];
      if (!prev || prev.budget === null || p.budget === null) return "";
      if (prev.budget === p.budget) return "";
      const x = M.l + i * band;
      return `M${x} ${y(toCents(prev.budget))} L${x} ${y(toCents(p.budget))}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={label}
      className="block w-full"
      data-testid="trend-chart"
    >
      <defs>
        <pattern
          id={hatchId}
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="6" height="6" fill={color} fillOpacity=".18" />
          <rect width="2.5" height="6" fill={color} fillOpacity=".55" />
        </pattern>
      </defs>
      {ticks.map((tick) => (
        <g key={tick}>
          <line
            x1={M.l}
            x2={W - M.r}
            y1={y(BigInt(tick) * 100n)}
            y2={y(BigInt(tick) * 100n)}
            stroke="var(--line)"
          />
          <text
            x={M.l - 6}
            y={y(BigInt(tick) * 100n) + 4}
            textAnchor="end"
            fontSize="11"
            style={{ fill: "var(--muted)" }}
          >
            {axisFmt.format(tick)}
          </text>
        </g>
      ))}
      {points.map((p, i) => {
        const cents = toCents(p.amount);
        const over = isOver(p);
        const fill = over ? "var(--warn)" : color;
        const x = M.l + i * band + (band - bw) / 2;
        const barTop = y(cents < 0n ? 0n : cents);
        const height = Math.max(0, y(0n) - barTop);
        return (
          <g key={p.month} data-testid="trend-bar" data-over={over} data-partial={p.partial}>
            <rect
              x={x}
              y={barTop}
              width={bw}
              height={height}
              rx="3"
              fill={p.partial && !over ? `url(#${hatchId})` : fill}
              fillOpacity={p.partial && over ? 0.5 : 1}
              stroke={p.partial ? fill : "none"}
              strokeWidth="1.5"
              strokeDasharray={p.partial ? "4 3" : undefined}
            />
            {showValues ? (
              <text
                x={x + bw / 2}
                y={barTop - 6}
                textAnchor="middle"
                fontSize="11"
                fontWeight="600"
                style={{ fill: over ? "var(--warn)" : "var(--fg)" }}
              >
                {axisFmt.format(wholeReais(cents))}
              </text>
            ) : null}
            <text
              x={x + bw / 2}
              y={H - 8}
              textAnchor="middle"
              fontSize={points.length > 8 ? 10 : 11}
              style={{ fill: "var(--muted)" }}
            >
              {shortMonth(p.month)}
              {p.partial ? "*" : ""}
            </text>
          </g>
        );
      })}
      {budgetPath ? (
        <>
          <path
            d={budgetPath}
            fill="none"
            stroke="var(--muted)"
            strokeOpacity=".7"
            strokeWidth="2.5"
            data-testid="trend-budget"
          />
          {stepPath ? (
            <path
              d={stepPath}
              fill="none"
              stroke="var(--muted)"
              strokeOpacity=".7"
              strokeWidth="2.5"
            />
          ) : null}
        </>
      ) : null}
      {avg !== null ? (
        <line
          x1={M.l}
          x2={W - M.r}
          y1={y(avg)}
          y2={y(avg)}
          stroke="var(--fg)"
          strokeWidth="1.6"
          strokeDasharray="6 4"
          data-testid="trend-average"
        >
          <title>{t("analytics.averageTitle", { amount: formatMoney(fromCents(avg)) })}</title>
        </line>
      ) : null}
    </svg>
  );
}
