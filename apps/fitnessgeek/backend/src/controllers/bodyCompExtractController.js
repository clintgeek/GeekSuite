// POST /api/body-comp/uploads/:id/extract — run AI extraction against a
// previously stored scan upload, validate it against the arithmetic gate,
// and save it if (and only if) the gate is satisfied.
//
// POST /api/body-comp/uploads/:id/accept — the partial-accept path. A
// mismatch is not always a dead end: DOCS/BODY_COMPOSITION_INTAKE.md §6 and
// `classifyMismatches` (packages/schemas/fitnessgeek/bodyCompositionDerivation.js)
// distinguish a PRINTED-ONLY mismatch (every implicated primary is confirmed
// by some other passing check — nothing wrong with the stored numbers, only
// the printed witness was misread) from a PRIMARY-SUSPECT one (a stored
// number is itself implicated). Only the first kind is ever safe to save
// without a fresh scan, and this endpoint is the one place that decides that
// — see its own header below for why the decision is re-made here rather
// than trusted from the client.
//
// This is the "wire it up" piece of DOCS/BODY_COMPOSITION_INTAKE.md §10.5:
// the upload endpoint (bodyCompUploadController.js) only validates, sniffs
// and stores bytes; `bodyCompExtractionService.js` only extracts and
// validates. This controller is where those results turn into an HTTP
// response and, on a clean pass or an accepted printed-only mismatch, a
// saved `BodyComposition` row.
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
import { validate, classifyMismatches } from '@geeksuite/schemas/fitnessgeek/bodyCompositionDerivation';

/**
 * Read the stored upload for this id, checked against this caller's own
 * userId. Shared by both routes below — both need the same "does this
 * upload exist and is it mine" answer, and both need it to fail the same
 * way (a 404, never a 403 — see `bodyCompUploadStorage.js`'s own header on
 * why ownership doesn't leak) and the same way again on a genuine read
 * failure (a 500).
 *
 * Exported for reuse by `bodyCompImportController.js` (the spreadsheet
 * import path) — the ownership/existence check is identical for both, and
 * this is the one implementation of "does this upload exist and is it
 * mine."
 *
 * @returns {Promise<{ok: true, upload: object} | {ok: false, response: {status: number, body: object}}>}
 */
export async function readOwnedUpload(id, userId) {
  let upload;
  try {
    upload = await getUpload(id, userId);
  } catch (error) {
    logger.error({ err: error, id, userId }, 'body-comp extract: failed reading the stored upload');
    return {
      ok: false,
      response: {
        status: 500,
        body: { success: false, error: { code: 'READ_FAILED', message: 'Could not read the stored upload.' } },
      },
    };
  }

  if (!upload) {
    return {
      ok: false,
      response: { status: 404, body: { success: false, error: { code: 'NOT_FOUND', message: 'Upload not found.' } } },
    };
  }

  return { ok: true, upload };
}

/**
 * Persist a candidate as a `BodyComposition` row, translating the one
 * expected failure mode (the `(userId, measured_at)` dedupe collision, §7)
 * into the same "duplicate" value both routes hand back rather than letting
 * it read as a 500.
 *
 * `extraction` and `notes` are handed in rather than built here because the
 * two callers disagree about them on purpose: a clean pass writes
 * `validation_passed: true` and no note, while an accepted printed-only
 * mismatch writes `false` (see `acceptBodyCompUpload`'s header for why that
 * is the honest value) plus a note naming exactly what didn't match, so the
 * row explains itself later without this request's ephemeral validation
 * result to refer back to.
 *
 * @returns {Promise<
 *   {ok: true, status: 'saved', bodyComposition: object} |
 *   {ok: true, status: 'duplicate'} |
 *   {ok: false, error: Error}
 * >}
 */
async function saveBodyComposition({ userId, candidate, measuredAt, mimeType, extraction, notes }) {
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
      source: mimeType === 'application/pdf' ? 'arboleaf_pdf' : 'arboleaf_image',
      extraction,
      ...(notes ? { notes } : {}),
    });
    return { ok: true, status: 'saved', bodyComposition: saved };
  } catch (error) {
    if (error?.code === 11000) {
      // The `(userId, measured_at)` unique index — the same physical scan,
      // re-shared as a different file (or re-imported by mistake). §7 calls
      // this out by name: it is expected traffic, not a fault.
      return { ok: true, status: 'duplicate' };
    }
    return { ok: false, error };
  }
}

/**
 * POST /api/body-comp/uploads/:id/extract
 * Requires an authenticated user (`authenticateToken` at the route).
 */
export async function extractBodyCompUpload(req, res) {
  const { id } = req.params;
  const userId = req.user?.id || req.user?.userId || req.user?._id;

  const owned = await readOwnedUpload(id, userId);
  if (!owned.ok) return res.status(owned.response.status).json(owned.response.body);
  const { upload } = owned;

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
    // `classifyMismatches` tells the UI (and, if the user chooses to act on
    // it, `acceptBodyCompUpload` below) whether this is the recoverable kind
    // of mismatch — a misread printed witness with every implicated primary
    // independently confirmed — or one that genuinely implicates a stored
    // number. Only the classification's `safeToAccept` flag decides whether
    // a one-tap save is even offered; this endpoint itself still never
    // saves on a mismatch, clean or not.
    const classification = classifyMismatches(validation);
    logger.info(
      { userId, id, checked: validation.checked, mismatches: validation.mismatches.length, safeToAccept: classification.safeToAccept },
      'body-comp extract: did not verify clean, not saving',
    );
    return res.status(200).json({
      success: true,
      data: {
        status: 'mismatch',
        candidate,
        printed,
        validation,
        classification,
        // Handed back so the confirm screen can round-trip it to
        // POST .../accept without the client having to reconstruct or
        // reformat a Date itself.
        measuredAt: measuredAt ? measuredAt.toISOString() : null,
      },
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

  const result = await saveBodyComposition({
    userId,
    candidate,
    measuredAt,
    mimeType: upload.mimeType,
    extraction: { validation_passed: true, confidence: null, method: 'aiGeek:bodyCompExtract' },
  });

  if (!result.ok) {
    logger.error({ err: result.error, userId, id }, 'body-comp extract: failed to save a verified scan');
    return res.status(500).json({
      success: false,
      error: { code: 'SAVE_FAILED', message: 'Could not save the scan.' },
    });
  }

  if (result.status === 'duplicate') {
    logger.info({ userId, id, measuredAt: measuredAt.toISOString() }, 'body-comp extract: duplicate scan, already imported');
    return res.status(200).json({
      success: true,
      data: { status: 'duplicate', message: 'This scan was already imported.' },
    });
  }

  logger.info({ userId, id, bodyCompositionId: result.bodyComposition._id?.toString?.() }, 'body-comp extract: saved a verified scan');
  return res.status(201).json({
    success: true,
    data: { status: 'saved', bodyComposition: result.bodyComposition },
  });
}

/**
 * POST /api/body-comp/uploads/:id/accept
 *
 * The partial-accept path: the confirm screen calls this after `.../extract`
 * came back `mismatch` with `classification.safeToAccept === true`, to save
 * the candidate anyway because the printed witness — not the stored data —
 * was the thing that was wrong.
 *
 * THE ONE RULE THAT MATTERS HERE: **never trust the client's own verdict.**
 * The request body is the same `candidate`/`printed` this endpoint's own
 * `.../extract` call handed the client a moment ago, but the client is the
 * one place in this flow that is not this server — it could be a stale tab
 * that never re-fetched, a replay, or simply wrong. A request that merely
 * asserted "safeToAccept: true" would let anyone save anything by lying
 * about that one field. So this handler re-runs `validate()` and
 * `classifyMismatches()` itself, from scratch, on exactly the numbers in the
 * request body — the client supplies the numbers, never the verdict.
 *
 * Requires an authenticated user (`authenticateToken` at the route).
 */
export async function acceptBodyCompUpload(req, res) {
  const { id } = req.params;
  const userId = req.user?.id || req.user?.userId || req.user?._id;

  // The upload row still has to be this user's own — same ownership check as
  // `.../extract`. The stored bytes themselves are not re-read: re-running
  // the vision model here would ask it the same ambiguous question a second
  // time and could come back with a DIFFERENT wrong answer, which would
  // defeat the entire point of asking "is the candidate the user is looking
  // at right now safe to save" rather than "what does a fresh guess say".
  const owned = await readOwnedUpload(id, userId);
  if (!owned.ok) return res.status(owned.response.status).json(owned.response.body);
  const { upload } = owned;

  const { candidate, printed, measuredAt: measuredAtRaw } = req.body || {};

  if (!candidate || typeof candidate !== 'object' || !printed || typeof printed !== 'object') {
    return res.status(400).json({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'A candidate and printed value set are required.' },
    });
  }

  // Re-derive the gate and the classifier from the numbers actually in the
  // request — see the header above. Nothing about the client's own opinion
  // of `safeToAccept` is read anywhere in this function.
  const validation = validate(candidate, printed);
  const classification = classifyMismatches(validation);

  // Same vacuous-pass trap as `.../extract` (§10.5): a document where every
  // check was skipped satisfies `validation.passed` AND, because
  // `classifyMismatches` has nothing to classify, `safeToAccept` too. Both
  // branches below require `checked > 0` for exactly that reason — a scan
  // that verified NOTHING is not "safe to accept," it is unverified.
  const verifiedClean = validation.passed && validation.checked > 0;
  const printedOnlyMismatch = !verifiedClean && validation.checked > 0 && classification.safeToAccept;

  if (!verifiedClean && !printedOnlyMismatch) {
    logger.warn(
      { userId, id, checked: validation.checked, suspectPrimaries: classification.suspectPrimaries },
      'body-comp accept: refused -- a stored primary is implicated, or nothing was verified',
    );
    return res.status(200).json({
      success: true,
      data: {
        status: 'refused',
        message: 'One or more measured numbers could not be confirmed by the rest of the scan, so this cannot be saved without a clean re-scan.',
        validation,
        classification,
      },
    });
  }

  const measuredAt = typeof measuredAtRaw === 'string' && measuredAtRaw ? new Date(measuredAtRaw) : null;
  if (candidate.weight_value == null || !measuredAt || Number.isNaN(measuredAt.getTime())) {
    // Mirrors `.../extract`'s own "incomplete" branch: the gate has nothing
    // left to object to, but one of the two fields the schema requires
    // isn't usable, so there is still nothing to save.
    logger.info({ userId, id }, 'body-comp accept: verified but missing a required field, not saving');
    return res.status(200).json({
      success: true,
      data: {
        status: 'incomplete',
        validation,
        classification,
        message: 'Could not read the scan\'s weight or its date/time clearly enough to save it.',
      },
    });
  }

  // A printed-only accept is a real, human-reviewed decision, and the saved
  // row must say so rather than looking identical to an unattended clean
  // pass — see `saveBodyComposition`'s header. `validation_passed` records
  // whether the ARITHMETIC actually agreed, not whether a human decided to
  // go ahead anyway; those are different facts and a future reader (or a
  // trend built on this row) deserves the honest one.
  const failedChecks = classification.printedOnly.map(
    (check) => `${check.label}: printed ${check.printed}, computed ${check.computed}`,
  );
  const notes = verifiedClean
    ? ''
    : `Accepted despite a printed-figure mismatch (every implicated stored number was confirmed by another check): ${failedChecks.join('; ')}`;

  const result = await saveBodyComposition({
    userId,
    candidate,
    measuredAt,
    mimeType: upload.mimeType,
    extraction: {
      validation_passed: verifiedClean,
      confidence: null,
      method: verifiedClean ? 'aiGeek:bodyCompExtract' : 'aiGeek:bodyCompExtract+partialAccept',
    },
    notes,
  });

  if (!result.ok) {
    logger.error({ err: result.error, userId, id }, 'body-comp accept: failed to save an accepted scan');
    return res.status(500).json({
      success: false,
      error: { code: 'SAVE_FAILED', message: 'Could not save the scan.' },
    });
  }

  if (result.status === 'duplicate') {
    logger.info({ userId, id, measuredAt: measuredAt.toISOString() }, 'body-comp accept: duplicate scan, already imported');
    return res.status(200).json({
      success: true,
      data: { status: 'duplicate', message: 'This scan was already imported.' },
    });
  }

  logger.info(
    { userId, id, bodyCompositionId: result.bodyComposition._id?.toString?.(), verifiedClean },
    'body-comp accept: saved an accepted scan',
  );
  return res.status(201).json({
    success: true,
    data: { status: 'saved', bodyComposition: result.bodyComposition },
  });
}
