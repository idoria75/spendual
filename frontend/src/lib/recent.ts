/** Per-browser conveniences (last method). Never required to work. */
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

export function lastMethodId(): number | null {
  const n = Number(read(METHOD_KEY));
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function rememberMethod(id: number | null): void {
  if (id !== null) write(METHOD_KEY, String(id));
}
