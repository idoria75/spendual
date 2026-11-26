const oneDecimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

const UNITS = ["B", "KB", "MB", "GB"];

/** 1258291 -> "1,3 MB". Decimal units (1 KB = 1000 B). Rounds before it picks the unit. */
export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  let unit = 0;
  let value = bytes;
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000;
    unit += 1;
  }
  // 999.95 KB rounds to "1000" at one decimal: move up one unit instead.
  if (Math.round(value * 10) / 10 >= 1000 && unit < UNITS.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return `${oneDecimal.format(value)} ${UNITS[unit]}`;
}
