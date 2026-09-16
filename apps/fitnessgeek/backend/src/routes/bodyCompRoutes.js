import express from 'express';
const router = express.Router();

import { authenticateToken } from '../middleware/auth.js';
import { getStagedShareFile } from '../controllers/shareTargetController.js';
import {
  bodyCompUploadMiddleware,
  handleBodyCompUploadError,
  createBodyCompUpload,
} from '../controllers/bodyCompUploadController.js';
import { extractBodyCompUpload } from '../controllers/bodyCompExtractController.js';

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

export default router;
