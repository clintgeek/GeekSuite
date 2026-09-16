import express from 'express';
const router = express.Router();

import {
  shareTargetUploadMiddleware,
  handleShareTargetUploadError,
  receiveShareTarget,
} from '../controllers/shareTargetController.js';

/**
 * @route POST /share-target
 * @desc Web Share Target action for FitnessGeek's manifest.json. Invoked by
 *       the Android share sheet, not by this app's own JS — see
 *       shareTargetController.js for the full CSRF / auth reasoning.
 * @access Public (stages bytes only; no authenticated write happens here)
 */
router.post('/', shareTargetUploadMiddleware, receiveShareTarget, handleShareTargetUploadError);

export default router;
