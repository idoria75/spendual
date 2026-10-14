/** Per-browser conveniences (recent categories, last method). Never required to work. */
const CATEGORIES_KEY = "spendual.recentCategories";
const METHOD_KEY = "spendual.lastMethod";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage blocked: ignore
  }
}

export function recentCategoryIds(): number[] {
  try {
    const parsed: unknown = JSON.parse(read(CATEGORIES_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((n): n is number => Number.isInteger(n)) : [];
  } catch {
    return [];
  }
}

export function rememberCategory(id: number): void {
  const next = [id, ...recentCategoryIds().filter((x) => x !== id)].slice(0, 8);
  write(CATEGORIES_KEY, JSON.stringify(next));
}

export function lastMethodId(): number | null {
  const n = Number(read(METHOD_KEY));
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function rememberMethod(id: number | null): void {
  if (id !== null) write(METHOD_KEY, String(id));
}
