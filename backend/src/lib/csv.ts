/** One CSV cell. Quotes when needed; text that a spreadsheet would run as a formula gets a '. */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text) && typeof value === "string") text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const BOM = String.fromCharCode(0xfeff);

/** Rows to CSV text: UTF-8 BOM (so Excel reads accents), CRLF line ends, one header row. */
export function toCsv(header: readonly string[], rows: (string | number | null)[][]): string {
  const lines = [header, ...rows].map((r) => r.map(csvCell).join(","));
  return `${BOM}${lines.join("\r\n")}\r\n`;
}
