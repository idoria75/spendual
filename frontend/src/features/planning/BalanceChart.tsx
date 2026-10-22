import type { PersonalPoint } from "@spendual/shared";
import { useId, useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { toCents } from "../../lib/currency";
import { axisScale, shortMonth, wholeReais } from "../analytics/trend";

const H = 230;
const AXIS_W = 52;
const PAD_R = 8;
const MARGIN_TOP = 22;
/** Narrowest month column. Wider ranges scroll sideways instead of squeezing the bars. */
const BAND_MIN = 44;
/** Plot width before the real width is measured (a 390 px phone). */
const DEFAULT_PLOT_W = 288;

const axisFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;

/**
 * Month-end balance of one person, one bar per month (same look as the Análises chart).
 * A negative balance hangs below the zero line. The month in progress is hatched.
 * The y axis stays in place; the plot scrolls sideways when the months do not fit.
 */
export function BalanceChart({
  points,
  color,
  label,
}: {
  points: PersonalPoint[];
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

  const closings = points.map((p) => toCents(p.closing));
  const top = closings.reduce((a, b) => (b > a ? b : a), 0n);
  const bottom = closings.reduce((a, b) => (b < a ? b : a), 0n);
  const { step } = axisScale(top > -bottom ? top : -bottom);
  const stepCents = BigInt(step) * 100n;
  // 8 percent of head room on each side, whole steps, at least one step above zero.
  const hi = ceilDiv(top > 100n ? (top * 108n) / 100n : 100n, stepCents) * stepCents;
  const lo = bottom < 0n ? -ceilDiv((-bottom * 108n) / 100n, stepCents) * stepCents : 0n;
  const ticks: bigint[] = [];
  for (let v = lo; v <= hi; v += stepCents) ticks.push(v);

  const years = new Set(points.map((p) => p.month.slice(0, 4)));
  const showYear = years.size > 1;
  const marginBottom = showYear ? 40 : 26;
  const plotW = Math.max(points.length * BAND_MIN + PAD_R, width);
  const scrolls = plotW > width;
  const ih = H - MARGIN_TOP - marginBottom;
  const band = (plotW - PAD_R) / Math.max(points.length, 1);
  const bw = Math.min(band * 0.58, 44);
  // Position on the scale from integer math; only the final ratio is a float.
  const y = (cents: bigint) =>
    MARGIN_TOP + ih - (Number(((cents - lo) * 10000n) / (hi - lo)) / 10000) * ih;
  const zero = y(0n);

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

  return (
    <>
      <div role="img" aria-label={label} data-testid="balance-chart" className="flex">
        <svg width={AXIS_W} height={H} aria-hidden className="shrink-0">
          {ticks.map((tick) => (
            <text
              key={String(tick)}
              x={AXIS_W - 6}
              y={y(tick) + 4}
              textAnchor="end"
              fontSize="11"
              style={{ fill: "var(--muted)" }}
            >
              {axisFmt.format(wholeReais(tick))}
            </text>
          ))}
        </svg>
        <div
          ref={scrollRef}
          data-testid="balance-scroll"
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
                key={String(tick)}
                x1={0}
                x2={plotW}
                y1={y(tick)}
                y2={y(tick)}
                stroke={tick === 0n ? "var(--muted)" : "var(--line)"}
              />
            ))}
            {points.map((p, i) => {
              const cents = toCents(p.closing);
              const negative = cents < 0n;
              const fill = negative ? "var(--warn)" : color;
              const x = i * band + (band - bw) / 2;
              const barY = negative ? zero : y(cents);
              const barH = Math.abs(y(cents) - zero);
              const yearLabel = p.month.endsWith("-01") || i === 0 ? p.month.slice(0, 4) : null;
              return (
                <g
                  key={p.month}
                  data-testid="balance-bar"
                  data-negative={negative}
                  data-partial={p.partial}
                >
                  <rect
                    x={x}
                    y={barY}
                    width={bw}
                    height={barH}
                    rx="3"
                    fill={p.partial && !negative ? `url(#${hatchId})` : fill}
                    fillOpacity={p.partial && negative ? 0.5 : 1}
                    stroke={p.partial ? fill : "none"}
                    strokeWidth="1.5"
                    strokeDasharray={p.partial ? "4 3" : undefined}
                  />
                  <text
                    x={x + bw / 2}
                    y={negative ? barY + barH + 14 : barY - 6}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight="600"
                    style={{ fill: negative ? "var(--warn)" : "var(--fg)" }}
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
          </svg>
        </div>
      </div>
      {scrolls ? <p className="text-[0.75rem] text-muted">{t("analytics.dragHint")}</p> : null}
    </>
  );
}
