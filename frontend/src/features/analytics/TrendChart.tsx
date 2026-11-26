import type { TrendPoint } from "@spendual/shared";
import { useId, useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { formatMoney, fromCents, toCents } from "../../lib/currency";
import { averageCents, axisScale, isOver, shortMonth, wholeReais } from "./trend";

const H = 230;
const AXIS_W = 44;
const PAD_R = 8;
const MARGIN_TOP = 22;
/** Narrowest month column. Wider ranges scroll sideways instead of squeezing the bars. */
const BAND_MIN = 44;
/** Plot width before the real width is measured (a 390 px phone). */
const DEFAULT_PLOT_W = 296;

const axisFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

/**
 * Vertical bars per month, a dashed average line and a gray budget line that steps when the
 * budget changed. Plain SVG, one scale for every mark (ui-guidelines §6.5).
 * The month in progress is hatched and left out of the average.
 * The y axis stays in place; the plot scrolls sideways when the months do not fit.
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; left: number } | null>(null);
  const [width, setWidth] = useState(DEFAULT_PLOT_W);
  const [dragging, setDragging] = useState(false);

  // The plot is drawn 1:1 in pixels, so the fixed axis next to it always lines up.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth > 0) setWidth(el.clientWidth);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const avg = averageCents(points);
  const amounts = points.map((p) => toCents(p.amount));
  const budgets = points.flatMap((p) => (p.budget === null ? [] : [toCents(p.budget)]));
  const top = [...amounts, ...budgets, avg ?? 0n].reduce((a, b) => (b > a ? b : a), 0n);
  const { max, step } = axisScale(top);
  const maxCents = BigInt(max) * 100n;
  const years = new Set(points.map((p) => p.month.slice(0, 4)));
  const showYear = years.size > 1;
  const marginBottom = showYear ? 40 : 26;
  const plotW = Math.max(points.length * BAND_MIN + PAD_R, width);
  const scrolls = plotW > width;
  const ih = H - MARGIN_TOP - marginBottom;
  const band = (plotW - PAD_R) / points.length;
  const bw = Math.min(band * 0.58, 44);
  // Position on the scale from integer math; only the final ratio is a float.
  const y = (cents: bigint) => MARGIN_TOP + ih - (Number((cents * 10000n) / maxCents) / 10000) * ih;
  const ticks = Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step);

  // Open on the newest months; older ones are a drag away.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [points, plotW]);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || !scrolls || !scrollRef.current) return;
    drag.current = { x: e.clientX, left: scrollRef.current.scrollLeft };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current || !scrollRef.current) return;
    scrollRef.current.scrollLeft = drag.current.left - (e.clientX - drag.current.x);
  };
  const endDrag = () => {
    drag.current = null;
    setDragging(false);
  };

  const budgetPath = points
    .map((p, i) => {
      if (p.budget === null) return "";
      const x0 = i * band;
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
      const x = i * band;
      return `M${x} ${y(toCents(prev.budget))} L${x} ${y(toCents(p.budget))}`;
    })
    .join(" ");

  return (
    <>
      <div role="img" aria-label={label} data-testid="trend-chart" className="flex">
        <svg width={AXIS_W} height={H} aria-hidden className="shrink-0">
          {ticks.map((tick) => (
            <text
              key={tick}
              x={AXIS_W - 6}
              y={y(BigInt(tick) * 100n) + 4}
              textAnchor="end"
              fontSize="11"
              style={{ fill: "var(--muted)" }}
            >
              {axisFmt.format(tick)}
            </text>
          ))}
        </svg>
        <div
          ref={scrollRef}
          data-testid="trend-scroll"
          data-scrolls={scrolls}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className={cn(
            "min-w-0 flex-1 overflow-x-auto [scrollbar-width:thin]",
            scrolls && (dragging ? "cursor-grabbing select-none" : "cursor-grab"),
          )}
          style={{ touchAction: "pan-x" }}
        >
          <svg width={plotW} height={H} viewBox={`0 0 ${plotW} ${H}`} className="block max-w-none">
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
              <line
                key={tick}
                x1={0}
                x2={plotW}
                y1={y(BigInt(tick) * 100n)}
                y2={y(BigInt(tick) * 100n)}
                stroke="var(--line)"
              />
            ))}
            {points.map((p, i) => {
              const cents = toCents(p.amount);
              const over = isOver(p);
              const fill = over ? "var(--warn)" : color;
              const x = i * band + (band - bw) / 2;
              const barTop = y(cents < 0n ? 0n : cents);
              const height = Math.max(0, y(0n) - barTop);
              const yearLabel = p.month.endsWith("-01") || i === 0 ? p.month.slice(0, 4) : null;
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
                  <text
                    x={x + bw / 2}
                    y={showYear ? H - 22 : H - 8}
                    textAnchor="middle"
                    fontSize="11"
                    style={{ fill: "var(--muted)" }}
                  >
                    {shortMonth(p.month)}
                    {p.partial ? "*" : ""}
                  </text>
                  {showYear && yearLabel ? (
                    <text
                      x={x + bw / 2}
                      y={H - 8}
                      textAnchor="middle"
                      fontSize="10"
                      fontWeight="600"
                      style={{ fill: "var(--muted)" }}
                    >
                      {yearLabel}
                    </text>
                  ) : null}
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
                x1={0}
                x2={plotW}
                y1={y(avg)}
                y2={y(avg)}
                stroke="var(--fg)"
                strokeWidth="1.6"
                strokeDasharray="6 4"
                data-testid="trend-average"
              >
                <title>
                  {t("analytics.averageTitle", { amount: formatMoney(fromCents(avg)) })}
                </title>
              </line>
            ) : null}
          </svg>
        </div>
      </div>
      {scrolls ? <p className="text-[0.75rem] text-muted">{t("analytics.dragHint")}</p> : null}
    </>
  );
}
