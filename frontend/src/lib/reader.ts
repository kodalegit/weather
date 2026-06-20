export function readNumber(value: unknown, names: string[]): number | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = readNumber(item, names);
      if (found !== null) return found;
    }
  }
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      const normalized = key.toLowerCase().replaceAll("_", "");
      if (names.includes(normalized) && typeof nested === "number")
        return nested;
      const found = readNumber(nested, names);
      if (found !== null) return found;
    }
  }
  return null;
}

export function readText(value: unknown, names: string[]): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = readText(item, names);
      if (found) return found;
    }
  }
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      const normalized = key.toLowerCase().replaceAll("_", "");
      if (names.includes(normalized) && typeof nested === "string")
        return nested;
      const found = readText(nested, names);
      if (found) return found;
    }
  }
  return null;
}

export function formatMaybe(
  value: number | string | null | undefined,
  suffix = "",
) {
  if (value === null || value === undefined || value === "") return "n/a";
  if (typeof value === "number") return `${Math.round(value)}${suffix}`;
  return value;
}
