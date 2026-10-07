// Client-side export of a table the page already holds: one header row plus
// value rows, written out as CSV, JSON, HTML or XLSX and handed to the
// browser as a download. Every format is built from the same `ExportTable`,
// so the four files always carry the same columns and values.

import type { SheetData } from "write-excel-file/browser";

export type ExportFormat = "csv" | "json" | "html" | "xlsx";

export const EXPORT_FORMATS: readonly ExportFormat[] = ["csv", "json", "html", "xlsx"];

export type ExportValue = string | number | boolean | Date | null;

export interface ExportColumn {
  /** Stable machine name: the JSON property. */
  key: string;
  /** Translated header: the CSV, HTML and XLSX column title. */
  label: string;
}

export interface ExportTable {
  columns: ExportColumn[];
  rows: ExportValue[][];
}

function textOf(value: ExportValue): string {
  if (value === null) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

// RFC 4180 quoting. A leading =, +, - or @ is prefixed with a quote so a
// spreadsheet opening the file does not evaluate a hostname or user name as
// a formula (CSV injection).
function csvCell(value: ExportValue): string {
  let text = textOf(value);
  if (typeof value === "string" && /^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(table: ExportTable): Blob {
  const lines = [table.columns.map((c) => c.label), ...table.rows].map((row) =>
    row.map((cell) => csvCell(cell as ExportValue)).join(","),
  );
  // BOM so Excel reads the file as UTF-8 instead of the system code page.
  return new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
}

function toJson(table: ExportTable): Blob {
  const objects = table.rows.map((row) =>
    Object.fromEntries(table.columns.map((c, i) => [c.key, row[i] instanceof Date ? textOf(row[i]) : row[i]])),
  );
  return new Blob([JSON.stringify(objects, null, 2)], { type: "application/json" });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toHtml(table: ExportTable, title: string, formatDate: (d: Date) => string): Blob {
  const cell = (v: ExportValue) => escapeHtml(v instanceof Date ? formatDate(v) : textOf(v));
  const head = table.columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join("");
  const body = table.rows
    .map((row) => `<tr>${row.map((v) => `<td>${cell(v)}</td>`).join("")}</tr>`)
    .join("\n");
  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  body { font: 13px system-ui, sans-serif; margin: 24px; color: #111; }
  h1 { font-size: 18px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f4f4f5; position: sticky; top: 0; }
  tr:nth-child(even) td { background: #fafafa; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<table>
<thead><tr>${head}</tr></thead>
<tbody>
${body}
</tbody>
</table>
</body>
</html>`;
  return new Blob([html], { type: "text/html;charset=utf-8" });
}

async function toXlsx(table: ExportTable, sheet: string): Promise<Blob> {
  // Loaded on demand: the library is only needed the moment someone exports.
  const { default: writeExcelFile } = await import("write-excel-file/browser");
  const header = table.columns.map((c) => ({ value: c.label, fontWeight: "bold" as const }));
  const data: SheetData = [header, ...table.rows];
  return writeExcelFile(data, {
    sheet: sheet.slice(0, 31), // Excel's limit on sheet names
    stickyRowsCount: 1,
    dateFormat: "dd/mm/yyyy hh:mm",
    columns: table.columns.map(() => ({ width: 22 })),
  }).toBlob();
}

function download(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
  // Revoked on the next tick: some browsers start the download asynchronously.
  setTimeout(() => URL.revokeObjectURL(href), 0);
}

/**
 * Writes `table` in `format` and downloads it as `<basename>-<timestamp>.<ext>`.
 * `title` heads the HTML page and names the XLSX sheet.
 */
export async function exportTable(
  table: ExportTable,
  format: ExportFormat,
  opts: { basename: string; title: string; formatDate: (d: Date) => string },
): Promise<void> {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const filename = `${opts.basename}-${stamp}.${format}`;
  const blob =
    format === "csv"
      ? toCsv(table)
      : format === "json"
        ? toJson(table)
        : format === "html"
          ? toHtml(table, opts.title, opts.formatDate)
          : await toXlsx(table, opts.title);
  download(blob, filename);
}
