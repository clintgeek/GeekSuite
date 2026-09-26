/**
 * The insurance CSV: every thing in scope, one row each, all core fields
 * plus every type attribute flattened into its own column. Identifiers are
 * written IN FULL — this file is for the insurer (the screen masks them;
 * the export is the one place they're meant to leave the app whole).
 *
 * UTF-8 with a BOM (so Excel reads "Café" and "—" correctly), CRLF line
 * ends, RFC 4180 quoting. Calendar dates are written as YYYY-MM-DD in UTC
 * (they are UTC-midnight days); money as plain numbers.
 */
import { dueDateOf, utcIsoToInputValue } from './dates';
import { moneyAmount } from './money';
import { placeLabel } from './places';
import { dateKindLabel } from './vocab';
import { hasValue } from './identifiers';

export const BOM = '﻿';

const CORE_COLUMNS = [
  ['Name', (t) => t.name],
  ['Type', (t) => t.type?.name ?? ''],
  ['Place', (t) => (t.place ? placeLabel(t.place) : '')],
  ['Tags', (t) => (t.tags ?? []).join('; ')],
  ['Current value', (t) => moneyAmount(t.value) ?? ''],
  ['Currency', (t) => (moneyAmount(t.value) !== null ? t.value?.currency || 'USD' : '')],
  ['Value as of', (t) => utcIsoToInputValue(t.value?.asOf)],
  ['Acquired', (t) => utcIsoToInputValue(t.acquired?.date)],
  ['Acquired from', (t) => t.acquired?.from ?? ''],
  ['Purchase price', (t) => moneyAmount(t.acquired?.price) ?? ''],
  ['Receipt on file', (t) => (hasReceipt(t) ? 'Yes' : 'No')],
  ['Photos', (t) => (t.photos ?? []).length],
  ['Documents', (t) => (t.documents ?? []).length],
  ['Next due', (t) => (t.nextDue ? t.nextDue.label || dateKindLabel(t.nextDue.kind) : '')],
  ['Next due date', (t) => utcIsoToInputValue(dueDateOf(t.nextDue))],
  ['Missing', (t) => (t.missing ?? []).join('; ')],
  ['Notes', (t) => t.notes ?? ''],
];

/** A receipt is on file as a receipt-role photo or document. */
export function hasReceipt(thing) {
  return (thing?.photos ?? []).some((p) => p.role === 'receipt') || (thing?.documents ?? []).some((d) => d.role === 'receipt');
}

export function csvCell(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function attributeCell(field) {
  const v = field.value;
  if (!hasValue(v)) return '';
  switch (field.kind) {
    case 'date':
      return utcIsoToInputValue(v);
    case 'money':
      return moneyAmount(v) ?? '';
    case 'boolean':
      return v === true || v === 'true' ? 'Yes' : 'No';
    default:
      return v;
  }
}

/** The attribute columns: one per distinct label (+unit), in first-seen order. */
export function attributeColumns(things = []) {
  const cols = [];
  const seen = new Set();
  for (const t of things) {
    for (const f of t.fields ?? []) {
      const header = f.unit ? `${f.label} (${f.unit})` : f.label;
      if (seen.has(header)) continue;
      seen.add(header);
      cols.push({ header, match: (x) => x.label === f.label && (x.unit ?? null) === (f.unit ?? null) });
    }
  }
  return cols;
}

export function buildInsuranceCsv(things = []) {
  const attrs = attributeColumns(things);
  const header = [...CORE_COLUMNS.map(([h]) => h), ...attrs.map((a) => a.header)];
  const lines = [header.map(csvCell).join(',')];
  for (const t of things) {
    const core = CORE_COLUMNS.map(([, get]) => get(t));
    const extra = attrs.map((a) => {
      const f = (t.fields ?? []).find(a.match);
      return f ? attributeCell(f) : '';
    });
    lines.push([...core, ...extra].map(csvCell).join(','));
  }
  return BOM + lines.join('\r\n') + '\r\n';
}

export function csvFilename(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `thinggeek-insurance-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.csv`;
}

/** Hand the CSV to the browser as a download. */
export function downloadCsv(text, filename = csvFilename()) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Walk every page of `GetReportThings` for a filter (no-cache: a 100-row
 * export must not land in the library's paged cache). `onProgress(loaded,
 * total)` after each page.
 */
export async function fetchAllThings(client, query, { filter = null, limit = 100, onProgress, maxPages = 200 } = {}) {
  const all = [];
  let page = 1;
  let pages = 1;
  do {
    const { data } = await client.query({ query, variables: { page, limit, filter, sort: 'name', sortDir: 'asc' }, fetchPolicy: 'no-cache' });
    const res = data?.things;
    if (!res) break;
    all.push(...(res.things ?? []));
    pages = res.pages ?? 1;
    onProgress?.(all.length, res.total ?? all.length);
    page += 1;
  } while (page <= pages && page <= maxPages);
  return all;
}
