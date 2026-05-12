export type CsvRow = Record<string, string>;

export function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

export function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i++;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

export function parseCsv(text: string) {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .filter((line) => line.trim().length > 0);

  if (!lines.length) return [];

  const headers = parseCsvLine(lines[0]).map(normalizeHeader);

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row: CsvRow = {};

    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });

    return row;
  });
}

export function getCsvValue(row: CsvRow, ...keys: string[]) {
  for (const key of keys) {
    const normalized = normalizeHeader(key);

    if (row[normalized] !== undefined) {
      return String(row[normalized] ?? "").trim();
    }
  }

  return "";
}

export function csvBool(value: string) {
  const normalized = value.trim().toLowerCase();
  return ["yes", "y", "true", "1", "no bid", "nobid"].includes(normalized);
}

export function toNumberFromCsv(value: string | null) {
  const raw = String(value ?? "").trim();

  if (!raw) return null;

  const parsed = Number(raw.replace(/[$,]/g, ""));

  if (Number.isNaN(parsed)) return null;

  return parsed;
}
