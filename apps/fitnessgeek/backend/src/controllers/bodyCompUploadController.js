// The real, authenticated, permanent upload endpoint for a body-composition
// scan (Arboleaf PDF/PNG export). Both intake paths land here through the
// exact same request shape:
//   - the share-target flow (shareTargetController.js) re-POSTs the staged
//     bytes from the app's own authenticated JS
//   - the plain <input type="file"> fallback (iOS/desktop/re-import) POSTs
//     directly
//
// This is intake plumbing only: it validates and stores the file and hands
// back an id. It does not write to Mongo/`@geeksuite/schemas` (another
// agent owns the storage schema) and does not run AI extraction (a later
// step) — see `bodyCompUploadStorage.js` for the interim storage shape and
// its known durability limitation.

import multer from 'multer';
import logger from '../config/logger.js';
import { sniffContentType, ALLOWED_UPLOAD_MIME_TYPES } from '../services/fileSniff.js';
import { saveUpload } from '../services/bodyCompUploadStorage.js';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB — matches bookgeek's import limit

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

export const bodyCompUploadMiddleware = upload.single('file');

/** multer's own errors (e.g. LIMIT_FILE_SIZE) land here via the route's 4-arg error handler. */
export function handleBodyCompUploadError(err, req, res, next) {
  if (!err) return next();
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      success: false,
      error: {
        code: 'FILE_TOO_LARGE',
        message: `File exceeds the ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB limit.`,
      },
    });
  }
  logger.error({ err }, 'body-comp upload: multer error');
  return res.status(400).json({
    success: false,
    error: { code: 'UPLOAD_ERROR', message: 'Could not read the uploaded file.' },
  });
}

/**
 * POST /api/body-comp/uploads
 * Requires an authenticated user (`authenticateToken` at the route).
 */
export async function createBodyCompUpload(req, res) {
  try {
    if (!req.file || !req.file.buffer || req.file.buffer.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'NO_FILE', message: 'No file was uploaded. Expected multipart field "file".' },
      });
    }

    // Sniff actual bytes — never trust req.file.mimetype (client-declared)
    // or the extension in req.file.originalname. See fileSniff.js docstring;
    // DOCS/screenshots/arboleaf.png in this repo is a real example of a
    // mislabeled extension (it's JPEG bytes).
    const mimeType = sniffContentType(req.file.buffer);
    if (!mimeType) {
      logger.warn(
        { declaredMimeType: req.file.mimetype, originalName: req.file.originalname, userId: req.user?.id },
        'body-comp upload: rejected — content did not match any allowed signature',
      );
      return res.status(415).json({
        success: false,
        error: {
          code: 'UNSUPPORTED_FILE_TYPE',
          message: `Unsupported file type. Allowed: ${ALLOWED_UPLOAD_MIME_TYPES.join(', ')}.`,
        },
      });
    }

    const userId = req.user?.id || req.user?.userId || req.user?._id;
    const metadata = await saveUpload({
      buffer: req.file.buffer,
      mimeType,
      originalName: req.file.originalname,
      userId,
    });

    logger.info({ id: metadata.id, mimeType, size: metadata.size, userId }, 'body-comp upload: stored');

    return res.status(201).json({
      success: true,
      data: {
        id: metadata.id,
        mimeType: metadata.mimeType,
        size: metadata.size,
        originalName: metadata.originalName,
        storedAt: metadata.storedAt,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'body-comp upload: failed to store file');
    return res.status(500).json({
      success: false,
      error: { code: 'UPLOAD_FAILED', message: 'Failed to store the uploaded file.' },
    });
  }
}
