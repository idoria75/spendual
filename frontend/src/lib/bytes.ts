const oneDecimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

/** 1258291 -> "1,2 MB". Decimal units (1 KB = 1000 B). */
export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${oneDecimal.format(bytes / 1000)} KB`;
  if (bytes < 1_000_000_000) return `${oneDecimal.format(bytes / 1_000_000)} MB`;
  return `${oneDecimal.format(bytes / 1_000_000_000)} GB`;
}
