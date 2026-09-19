// bodyCompXlsxParser — read an Arboleaf ".xlsx" data export into plain row
// objects keyed by the export's own column headers.
//
// WHY THIS EXISTS
// ----------------
// DOCS/BODY_COMPOSITION_INTAKE.md's original intake path transcribes a scan
// report IMAGE with a vision model — necessary because a report is all a
// user can normally get out of the Arboleaf app, but fragile: a free-tier
// vision model misreading a dense numeric table is exactly the failure mode
// the arithmetic gate (`bodyCompositionDerivation.js`) was built to catch.
//
// The Arboleaf app also exports its FULL measurement history as a `.xlsx`
// spreadsheet — one row per scan, every value we store as its own column,
// with no image, no OCR and no model in between. This module is the reader
// half of that path: turn the workbook's bytes into an array of
// `{ "Column Header": "cell text" }` objects, one per data row, so
// `bodyCompXlsxImportService.js` can map each row onto the shared
// `BodyComposition` field set the exact same way regardless of source.
//
// WHAT THE REAL FILE ACTUALLY LOOKS LIKE — MEASURED, NOT ASSUMED
// -----------------------------------------------------------------
// `DOCS/body_comp.xlsx` (a real export, committed as ground truth) was
// inspected before writing a line of parsing code, per this repo's own
// lesson from the PDF path (see BODY_COMPOSITION_INTAKE.md §4.1 — "assumed
// DCTDecode, failed on the real vendor file"). What is actually inside:
//
//   - A single worksheet ("Sheet1"), addressed A1:BA7 — 53 columns, one
//     header row plus 6 rows of scan history.
//   - NO `xl/sharedStrings.xml` part at all. Every cell — including ones
//     holding plain numbers like weight — is written `<c t="str"><v>...</v>`
//     with its literal text inline. That is unusual (`t="str"` normally
//     pairs with a cached formula result, and Excel itself would use
//     `t="inlineStr"` with an `<is><t>` wrapper for a literal string with no
//     shared-string table), but it is what this exporter emits, and every
//     cell in the real file follows it. This module reads `<v>` at face
//     value regardless of its `t` attribute rather than branching on a type
//     this exporter doesn't actually vary — a parser that insisted on
//     shared strings or `inlineStr` would reject every file this feature
//     exists to read.
//   - EVERY value, numeric or not, is therefore plain text at the XML layer.
//     Numeric parsing happens one layer up, in the import service, once a
//     header name says which columns are numbers.
//
// LIBRARY CHOICE
// ---------------
// An `.xlsx` is a ZIP of XML parts (OPC — Open Packaging Conventions), so
// reading one needs an unzipper plus an XML parser. Rather than adding a
// dedicated spreadsheet-reading dependency (`xlsx`/`exceljs`/etc, most of
// which assume `sharedStrings.xml` exists and know nothing about this
// exporter's quirks anyway), this uses two small, already-vetted pieces:
//
//   - `jszip` — pure JavaScript, its own decompression (`pako`, itself pure
//     JS) with no native addon, and already present in this monorepo's
//     lockfile (pulled in transitively by `epubjs`). Confirmed no `.node`
//     binary anywhere in its dependency tree before adding it here — it
//     runs unmodified on this backend's `node:20-alpine` base, which has no
//     C toolchain for a native module to compile against.
//   - `fast-xml-parser` — also pure JavaScript, also already in the
//     lockfile (pulled in transitively by `@aws-sdk/xml-builder`), same
//     alpine-safety check performed the same way.
//
// Both are added as direct dependencies of THIS package (transitive lockfile
// presence doesn't make a package `require`-able/`import`-able from here —
// pnpm's workspace `node_modules` are not flattened), pinned to the exact
// versions already resolved elsewhere in the workspace so this addition
// introduces no new version of either into the tree.

import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';

/**
 * One parser instance, reused across calls — it is stateless and
 * constructing it isn't free.
 *
 * `parseTagValue`/`parseAttributeValue: false` keep every `<v>` and every
 * attribute as a plain string. The default (numeric auto-coercion) would
 * silently turn `"321"` into the JS number `321`, which happens to be
 * harmless for the numeric columns this module cares about but is exactly
 * the kind of implicit type change that bites the next column added to this
 * export — leaving coercion to the caller, which knows which columns are
 * dates/text/numbers, is the honest place for it.
 */
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,
  // Force these into arrays even when there's exactly one of them (a
  // workbook with a single sheet, or a row with a single cell) — without
  // this, fast-xml-parser hands back a bare object instead of a one-element
  // array and every `.map`/`.find` below would need a second code path for
  // "the singular case."
  isArray: (name) => ['row', 'c', 'sheet', 'Relationship'].includes(name),
});

/** Always an array: fast-xml-parser hands back a bare object for a lone child even with `isArray` set on some paths reached differently, so callers still guard. */
function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/** The leading letters of a cell reference ("AG12" -> "AG") — the column key, independent of row number. */
function columnOf(cellRef) {
  return String(cellRef ?? '').match(/^[A-Z]+/)?.[0] || '';
}

/**
 * A cell's text, at face value. Every cell in this export carries its value
 * inline in `<v>` regardless of its declared `t` (see this file's header) —
 * an empty/self-closing `<c>` has no `v` key at all, which becomes `''`
 * here rather than `undefined`, so a caller can always call `.trim()`
 * without a null check.
 */
function cellText(cell) {
  const v = cell?.v;
  if (v === undefined || v === null || typeof v === 'object') return '';
  return String(v);
}

/**
 * Resolve which worksheet part backs the workbook's first sheet.
 *
 * Hard-coding `xl/worksheets/sheet1.xml` would work for THIS export (it is
 * in fact Sheet1 at that path), but the sheet-to-part mapping is only
 * guaranteed by `workbook.xml`'s relationship id, not by naming convention —
 * OPC allows any part name. Resolving it properly costs two more small XML
 * reads and means a future export with a differently-ordered or renamed
 * part still finds its data instead of silently reading the wrong sheet (or
 * an old cached one) if the vendor's exporter ever changes.
 *
 * @param {JSZip} zip
 * @returns {Promise<string>} the worksheet part's path inside the zip
 */
async function resolveFirstSheetPath(zip) {
  const FALLBACK = 'xl/worksheets/sheet1.xml';

  const workbookFile = zip.file('xl/workbook.xml');
  const relsFile = zip.file('xl/_rels/workbook.xml.rels');
  if (!workbookFile || !relsFile) return FALLBACK;

  const workbookXml = xmlParser.parse(await workbookFile.async('string'));
  const firstSheet = asArray(workbookXml?.workbook?.sheets?.sheet)[0];
  const rId = firstSheet?.['@_r:id'];
  if (!rId) return FALLBACK;

  const relsXml = xmlParser.parse(await relsFile.async('string'));
  const relationship = asArray(relsXml?.Relationships?.Relationship).find((r) => r['@_Id'] === rId);
  const target = relationship?.['@_Target'];
  if (!target) return FALLBACK;

  // Targets in workbook.xml.rels are relative to `xl/` (e.g.
  // "worksheets/sheet1.xml"), never absolute — OPC allows a leading "/" or
  // "./" in principle, so both are stripped defensively.
  return `xl/${target.replace(/^\.?\/?/, '')}`;
}

/**
 * Parse an Arboleaf `.xlsx` export buffer into one plain object per scan
 * row, keyed by the export's own column headers exactly as printed
 * ("Weight(lb)", "Skeleton Muscle Mass(lb)", …) — deliberately NOT
 * normalized (lower-cased, stripped of punctuation, …), because
 * `bodyCompXlsxImportService.js`'s column map has to match these headers
 * verbatim to catch a vendor renaming a column, and a normalizing step here
 * would quietly paper over exactly that.
 *
 * @param {Buffer} buffer - the raw `.xlsx` file bytes.
 * @returns {Promise<Array<Record<string, string>>>} one object per data row
 *   (the header row itself is consumed, never returned as data).
 * @throws {Error} if the buffer isn't a readable zip, or has no worksheet.
 */
export async function parseBodyCompXlsx(buffer) {
  const zip = await JSZip.loadAsync(buffer);

  const sheetPath = await resolveFirstSheetPath(zip);
  const sheetFile = zip.file(sheetPath);
  if (!sheetFile) {
    throw new Error(`bodyCompXlsxParser: worksheet part "${sheetPath}" not found in the workbook`);
  }

  const sheetXml = xmlParser.parse(await sheetFile.async('string'));
  const rows = asArray(sheetXml?.worksheet?.sheetData?.row);
  if (rows.length === 0) return [];

  const [headerRow, ...dataRows] = rows;

  // Column letter -> header text, built once from row 1.
  const headerByColumn = new Map();
  for (const cell of asArray(headerRow.c)) {
    const header = cellText(cell).trim();
    if (header) headerByColumn.set(columnOf(cell['@_r']), header);
  }

  return dataRows.map((row) => {
    const record = {};
    for (const cell of asArray(row.c)) {
      const header = headerByColumn.get(columnOf(cell['@_r']));
      // A column absent from row 1 (shouldn't happen in a well-formed
      // export) is skipped rather than keyed by its bare column letter —
      // an unmappable value is better lost than silently mislabeled.
      if (header) record[header] = cellText(cell);
    }
    return record;
  });
}

export default { parseBodyCompXlsx };
