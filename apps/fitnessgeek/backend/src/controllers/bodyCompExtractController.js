// POST /api/body-comp/uploads/:id/extract — run AI extraction against a
// previously stored scan upload, validate it against the arithmetic gate,
// and save it if (and only if) the gate is satisfied.
//
// This is the "wire it up" piece of DOCS/BODY_COMPOSITION_INTAKE.md §10.5:
// the upload endpoint (bodyCompUploadController.js) only validates, sniffs
// and stores bytes; `bodyCompExtractionService.js` only extracts and
// validates. This controller is where those results turn into an HTTP
// response and, on a clean pass, a saved `BodyComposition` row.
//
// Every branch below answers 200 (or 201 on an actual save) for an outcome
// that is a normal part of this feature working as designed — an
// unavailable model, a mismatch, a duplicate scan — matching the rest of
// this app's AI routes (see aiRoutes.js's own header: "no route 500s because
// a model was busy"). A 500 here means a bug in here, not a bad scan.

import { toUtcMidnight } from '@geeksuite/utils';
import logger from '../config/logger.js';
import BodyComposition from '../models/BodyComposition.js';
import { getUpload } from '../services/bodyCompUploadStorage.js';
import { extractBodyComposition } from '../services/bodyCompExtractionService.js';

/**
 * POST /api/body-comp/uploads/:id/extract
 * Requires an authenticated user (`authenticateToken` at the route).
 */
export async function extractBodyCompUpload(req, res) {
  const { id } = req.params;
  const userId = req.user?.id || req.user?.userId || req.user?._id;

  let upload;
  try {
    // `getUpload` returns `null` for a malformed id, a missing one, AND one
    // that belongs to a different user — see its own header for why that
    // last case isn't a 403. All three read as the same 404 here.
    upload = await getUpload(id, userId);
  } catch (error) {
    logger.error({ err: error, id, userId }, 'body-comp extract: failed reading the stored upload');
    return res.status(500).json({
      success: false,
      error: { code: 'READ_FAILED', message: 'Could not read the stored upload.' },
    });
  }

  if (!upload) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Upload not found.' },
    });
  }

  const extraction = await extractBodyComposition({
    buffer: upload.buffer,
    mimeType: upload.mimeType,
    userId,
  });

  if (!extraction.ok) {
    // Everything that lands here is a value, not a bug: an unconfigured or
    // busy model, a PDF whose embedded image uses a filter this app cannot
    // read (bodyCompImagePrep.js), or an answer with no parseable JSON in
    // it. The UI's job is "try again" / "share a different file," not a
    // stack trace.
    logger.warn({ userId, id, stage: extraction.stage, code: extraction.code }, 'body-comp extract: extraction did not succeed');
    return res.status(200).json({
      success: true,
      data: {
        status: 'extraction_failed',
        stage: extraction.stage,
        code: extraction.code,
        message: extraction.message,
      },
    });
  }

  const { candidate, printed, measuredAt, validation } = extraction;

  // §6 / §10.5: `validate()` PASSES VACUOUSLY when every check was skipped —
  // a scan where nothing could be cross-checked is not the same thing as a
  // scan that checked out clean, and `passed` alone cannot tell the two
  // apart. `checked` is what distinguishes them, so both are required here.
  const verifiedClean = validation.passed && validation.checked > 0;

  if (!verifiedClean) {
    logger.info({ userId, id, checked: validation.checked, mismatches: validation.mismatches.length }, 'body-comp extract: did not verify clean, not saving');
    return res.status(200).json({
      success: true,
      data: { status: 'mismatch', candidate, printed, validation },
    });
  }

  if (candidate.weight_value == null || measuredAt == null) {
    // The gate was satisfied on everything it COULD check, but one of the
    // two fields the schema itself requires (`weight_value`, `measured_at`)
    // never came back readable — e.g. every primary transcribed cleanly but
    // the report's own timestamp did not. Not a mismatch (nothing
    // disagreed); not a save either (there's a hole the schema won't allow).
    logger.info({ userId, id }, 'body-comp extract: verified but missing a required field, not saving');
    return res.status(200).json({
      success: true,
      data: {
        status: 'incomplete',
        candidate,
        printed,
        validation,
        message: 'Could not read the scan\'s weight or its date/time clearly enough to save it.',
      },
    });
  }

  // THE UTC DATE SEPARATION PRINCIPLE (THE_CONTEXT.md §3.1) — `measured_at`
  // is the full instant printed on the report; `log_date` is the UTC
  // midnight of the day it counts for, and the only thing `Weight` ever
  // joins against. Do not conflate them (see bodyComposition.js's header).
  const logDate = toUtcMidnight(measuredAt);

  try {
    const saved = await BodyComposition.create({
      userId,
      ...candidate,
      measured_at: measuredAt,
      log_date: logDate,
      source: upload.mimeType === 'application/pdf' ? 'arboleaf_pdf' : 'arboleaf_image',
      extraction: {
        validation_passed: true,
        confidence: null,
        method: 'aiGeek:bodyCompExtract',
      },
    });

    logger.info({ userId, id, bodyCompositionId: saved._id?.toString?.() }, 'body-comp extract: saved a verified scan');
    return res.status(201).json({
      success: true,
      data: { status: 'saved', bodyComposition: saved },
    });
  } catch (error) {
    if (error?.code === 11000) {
      // The `(userId, measured_at)` unique index — the same physical scan,
      // re-shared as a different file (or re-imported by mistake). §7 calls
      // this out by name: it is expected traffic, not a fault.
      logger.info({ userId, id, measuredAt: measuredAt.toISOString() }, 'body-comp extract: duplicate scan, already imported');
      return res.status(200).json({
        success: true,
        data: { status: 'duplicate', message: 'This scan was already imported.' },
      });
    }

    logger.error({ err: error, userId, id }, 'body-comp extract: failed to save a verified scan');
    return res.status(500).json({
      success: false,
      error: { code: 'SAVE_FAILED', message: 'Could not save the scan.' },
    });
  }
}
