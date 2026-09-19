import express from 'express';
const router = express.Router();

import { authenticateToken } from '../middleware/auth.js';
import { getStagedShareFile } from '../controllers/shareTargetController.js';
import {
  bodyCompUploadMiddleware,
  handleBodyCompUploadError,
  createBodyCompUpload,
} from '../controllers/bodyCompUploadController.js';
import { extractBodyCompUpload, acceptBodyCompUpload } from '../controllers/bodyCompExtractController.js';
import { importBodyCompXlsxUploadRoute } from '../controllers/bodyCompImportController.js';

/**
 * @route GET /api/body-comp/share-staged/:id
 * @desc Claim a file staged by the Web Share Target POST (single-use).
 *       Authenticated: this is the installed app fetching bytes for itself
 *       right after the share-target redirect landed it on /scan-import.
 * @access Private
 */
router.get('/share-staged/:id', authenticateToken, getStagedShareFile);

/**
 * @route POST /api/body-comp/uploads
 * @desc Validate, sniff and permanently store a body-composition scan file.
 *       Used by both the share-target re-post flow and the plain
 *       <input type="file"> fallback.
 * @access Private
 */
router.post(
  '/uploads',
  authenticateToken,
  bodyCompUploadMiddleware,
  createBodyCompUpload,
  handleBodyCompUploadError,
);

/**
 * @route POST /api/body-comp/uploads/:id/extract
 * @desc Run AI extraction against a stored upload, validate it against the
 *       arithmetic gate (DOCS/BODY_COMPOSITION_INTAKE.md §6), and save a
 *       `BodyComposition` row only if it verifies clean. A mismatch or an
 *       unavailable model both come back as a 200 the UI can render, not an
 *       error — see bodyCompExtractController.js.
 * @access Private
 */
router.post('/uploads/:id/extract', authenticateToken, extractBodyCompUpload);

/**
 * @route POST /api/body-comp/uploads/:id/accept
 * @desc The partial-accept path (DOCS/BODY_COMPOSITION_INTAKE.md §6, extended
 *       by the printed-only/primary-suspect split in
 *       `bodyCompositionDerivation.js`'s `classifyMismatches`). Called by the
 *       confirm screen after a `.../extract` mismatch whose `classification`
 *       came back `safeToAccept: true`. Re-runs the gate and the classifier
 *       server-side on whatever the request body actually contains — the
 *       client's own opinion of "safe" is never trusted (see
 *       bodyCompExtractController.js's header on `acceptBodyCompUpload`).
 * @access Private
 */
router.post('/uploads/:id/accept', authenticateToken, acceptBodyCompUpload);

/**
 * @route POST /api/body-comp/uploads/:id/import-xlsx
 * @desc The spreadsheet import path (DOCS/BODY_COMPOSITION_INTAKE.md — the
 *       Arboleaf app's own ".xlsx" history export). No AI extraction and no
 *       confirm screen: every row runs the same arithmetic gate as the
 *       vision path, using the export's own derived columns as the witness,
 *       and only a row that verifies clean is saved. Returns aggregate
 *       `{imported, skipped, failed}` counts across the whole file — see
 *       bodyCompImportController.js.
 * @access Private
 */
router.post('/uploads/:id/import-xlsx', authenticateToken, importBodyCompXlsxUploadRoute);

export default router;
