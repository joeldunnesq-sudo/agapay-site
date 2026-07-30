import { ValidationError } from "./errors.js";

export function text(value) {
  return String(value ?? "").trim();
}

export function normalize(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function cents(value, label = "Bank amount") {
  const cleaned = text(value).replace(/[$,\s]/g, "");
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(cleaned)) throw new ValidationError(`${label} is invalid.`);
  return Math.round(Number(cleaned) * 100);
}

export function csvRows(csv, delimiter = ",") {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let index = 0; index < String(csv || "").length; index++) {
    const character = csv[index];
    if (character === '"') {
      if (quoted && csv[index + 1] === '"') {
        field += '"';
        index++;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && csv[index + 1] === "\n") index++;
      row.push(field);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) throw new ValidationError("CSV contains an unterminated quoted field.");
  row.push(field);
  if (row.some((value) => value !== "")) rows.push(row);
  return rows;
}

export async function digest(value) {
  const input = typeof value === "string" ? value : JSON.stringify(value);
  const bytes = new TextEncoder().encode(input);
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function csvTable({ filename, csv, delimiter = ",", maxBytes = 1_000_000, maxRows = 5_000 } = {}) {
  if (!/\.csv$/i.test(filename || "") || new TextEncoder().encode(csv || "").length > maxBytes) {
    throw new ValidationError(`A CSV file under ${Math.round(maxBytes / 1_000_000)} MB is required.`);
  }
  const rows = csvRows(csv, delimiter);
  if (rows.length < 2 || rows.length - 1 > maxRows) {
    throw new ValidationError(`CSV must contain a header and no more than ${maxRows.toLocaleString("en-US")} rows.`);
  }
  return {
    headers: rows[0],
    normalizedHeaders: rows[0].map(normalize),
    rows: rows.slice(1)
  };
}

export function columnIndexes(normalizedHeaders, columnMap, defaults) {
  return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [
    key,
    normalizedHeaders.indexOf(normalize(columnMap?.[key] || fallback))
  ]));
}
