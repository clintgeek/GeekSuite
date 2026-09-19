// POST /api/body-comp/uploads/:id/import-xlsx — run the spreadsheet import
// path against a previously stored upload.
//
// This is the xlsx sibling of bodyCompExtractController.js's `.../extract`:
// same "upload first, act on it second" shape (bodyCompUploadController.js
// only sniffs and stores bytes), same ownership check
// (`readOwnedUpload`, reused from that file rather than duplicated), same
// "no route 500s for a normal outcome" rule. It diverges after that, because
// the two paths solve different problems:
//
//   - `.../extract` runs ONE image through a vision model and returns ONE
//     scan's outcome (saved / mismatch / duplicate / incomplete /
//     extraction_failed) — a single row, possibly needing a human's
//     confirm-screen decision.
//   - `.../import-xlsx` runs a WHOLE history file through the arithmetic
//     gate with no AI anywhere in the path (DOCS/BODY_COMPOSITION_INTAKE.md
//     — the entire point of this path is that the export validates itself
//     well enough to import unattended) and returns AGGREGATE counts across
//     however many rows the file contained. There is no confirm screen here:
//     a row that fails the gate is not "offered for review," it is simply
//     not saved, and the failure is a mapping bug to fix in
//     `bodyCompXlsxImportService.js`, not a data problem the calling user
//     could resolve — see that module's own header.
//
// See DOCS/BODY_COMPOSITION_INTAKE.md §7 for why a whole file can be
// re-uploaded safely: rows already imported collide on the
// `(userId, measured_at)` unique index and are reported as `skipped`, never
// re-saved or treated as an error.

import logger from '../config/logger.js';
import { readOwnedUpload } from './bodyCompExtractController.js';
import { importBodyCompXlsxUpload } from '../services/bodyCompXlsxImportService.js';
import { XLSX_MIME_TYPE } from '../services/fileSniff.js';

/**
 * POST /api/body-comp/uploads/:id/import-xlsx
 * Requires an authenticated user (`authenticateToken` at the route).
 */
export async function importBodyCompXlsxUploadRoute(req, res) {
  const { id } = req.params;
  const userId = req.user?.id || req.user?.userId || req.user?._id;

  const owned = await readOwnedUpload(id, userId);
  if (!owned.ok) return res.status(owned.response.status).json(owned.response.body);
  const { upload } = owned;

  // The upload endpoint stores whatever sniffed type it was handed — a
  // caller could point this route at a PDF/image upload id by mistake (or
  // by a stale client). Refuse plainly rather than handing a non-spreadsheet
  // buffer to the xlsx parser and letting IT be the one to fail confusingly.
  if (upload.mimeType !== XLSX_MIME_TYPE) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'NOT_AN_XLSX_UPLOAD',
        message: 'This upload is not a spreadsheet export.',
      },
    });
  }

  let result;
  try {
    result = await importBodyCompXlsxUpload({ buffer: upload.buffer, userId });
  } catch (error) {
    // Only a genuinely unreadable workbook (corrupt zip, no worksheet part —
    // see bodyCompXlsxParser.js) reaches here; every per-row problem is
    // already folded into `result.failed` by the service and never throws.
    logger.error({ err: error, userId, id }, 'body-comp xlsx import: could not read the workbook');
    return res.status(200).json({
      success: true,
      data: {
        status: 'unreadable',
        message: 'Could not read this file as a spreadsheet export.',
      },
    });
  }

  logger.info(
    { userId, id, imported: result.imported, skipped: result.skipped, failed: result.failed },
    'body-comp xlsx import: finished',
  );

  return res.status(200).json({
    success: true,
    data: { status: 'imported', ...result },
  });
}

export default { importBodyCompXlsxUploadRoute };
