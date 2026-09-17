// Handles the Web Share Target action: the Android share sheet POSTs a PDF
// or image straight to `POST /share-target`, no app JS involved.
//
// ## The CSRF problem, and why this shape solves it without an exemption
// that weakens anything
//
// `csrfGuard` (`packages/user/src/server/csrfGuard.js`, mounted globally in
// app.js) is the control actually enforced on this backend's own mutations
// today (`CSRF_GUARD`, all seven backends). basegeek's separate
// double-submit `X-CSRF-Token`/`geek_csrf` check (`CSRF_TOKEN`) is
// basegeek-only per DOCS/RUNBOOK.md and DOCS/THE_CONTEXT.md §3.2 — but
// `@geeksuite/auth`'s axios interceptor attaches that header to every
// mutation this app's own JS makes regardless, so a request built by the
// app is ready for either control, today or after `CSRF_TOKEN=enforce`
// ships suite-wide (DOCS/THE_PLAN.md §2.1). A share-sheet POST is neither:
// it is not this app's JS, so it carries no `X-CSRF-Token`, and as a
// same-origin top-level OS-initiated navigation it may or may not carry an
// `Origin` header depending on the browser — not something to build a
// security boundary on.
//
// Rather than exempt this path from CSRF and let it perform a real,
// user-attributed write, this handler treats it as making NO
// authenticated, persistent state change at all:
//   1. Validate + sniff the file (same rules as the real upload endpoint).
//   2. Stage the bytes in memory under a random, single-use id
//      (`shareTargetStaging.js`) — no user attribution, nothing durable.
//   3. 303-redirect the browser to a page inside the installed app.
//
// The page that loads is a normal authenticated page load: it fetches the
// staged bytes over GET (safe method, `csrfGuard` never guards GET) and
// re-POSTs them through `POST /api/body-comp/uploads` — the SAME endpoint
// the manual file-picker uses — via this app's own fetch/axios call, which
// is same-origin (satisfies the Origin allow-list) and attaches
// `X-CSRF-Token` (satisfies the double-submit check if/when it is ever
// enforced here too). No CSRF control is loosened anywhere: the only thing
// reachable without one is "stage some bytes nobody can read back except
// by knowing the random id, which then vanish."
//
// `app.js` still lists this path in `csrfGuard`'s `exemptPaths` — not
// because the guard would otherwise misbehave (an absent Origin/Referer
// already passes it, see csrfGuard.js "why step 4 passes"), but so the
// exemption is explicit, tested, and does not depend on incidental
// same-origin-navigation header behavior that could differ across Android
// WebView/Chrome versions.
//
// This route also is NOT registered under `/api/*`: it needs to be
// excluded from VitePWA's `navigateFallback` (see vite.config.js's
// `navigateFallbackDenylist`), because Workbox's NavigationRoute matches
// ANY navigation request regardless of HTTP method — left unguarded, the
// service worker would answer this POST with the precached index.html
// before it ever reached the network, silently dropping the shared file.

import multer from 'multer';
import logger from '../config/logger.js';
import { sniffContentType, ALLOWED_UPLOAD_MIME_TYPES } from '../services/fileSniff.js';
import { stageFile, consumeStagedFile } from '../services/shareTargetStaging.js';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB — matches bookgeek's import limit

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

// `any()` rather than `single('file')`, deliberately.
//
// The manifest names the field `file` and Chrome is supposed to honour that,
// but on the first real share from a phone the POST arrived with a 75-byte
// multipart body and no `file` part at all, and `single()` cannot tell the
// difference between "Android sent nothing", "Android used a different field
// name" and "Android sent it under `files[]`". All three look like `no_file`.
//
// Taking whatever arrives and inspecting it turns a guess into an
// observation, and costs nothing: the size limit still applies per file, and
// the content sniffing below is what actually decides whether we keep it.
export const shareTargetUploadMiddleware = upload.any();

const RECEIVED_PATH = '/scan-import';

function redirectTo(res, query) {
  const qs = new URLSearchParams(query).toString();
  // 303 See Other: turns the browser's next request into a GET, which is
  // what actually lets a client-side route render — a 307/308 would replay
  // the POST at the new location instead.
  res.redirect(303, `${RECEIVED_PATH}?${qs}`);
}

/**
 * POST /share-target
 * Public, unauthenticated, no persistent write — see module docstring.
 */
export async function receiveShareTarget(req, res) {
  try {
    // `any()` gives an array; take the first part with actual bytes whatever
    // it was called. A share carries one file.
    const parts = Array.isArray(req.files) ? req.files : [];
    const file = parts.find((p) => p?.buffer?.length > 0) || null;

    if (!file) {
      // Say what DID arrive. A bare "no file" is what sent us guessing the
      // first time; the field names and the non-file fields are the whole
      // diagnosis, and they cost one log line on a path that is only hit by
      // a deliberate share.
      logger.warn(
        {
          partCount: parts.length,
          fieldNames: parts.map((p) => p?.fieldname),
          partSizes: parts.map((p) => p?.size),
          textFields: Object.keys(req.body || {}),
          textFieldValues: Object.fromEntries(
            Object.entries(req.body || {}).map(([k, v]) => [k, String(v).slice(0, 200)]),
          ),
          contentLength: req.headers['content-length'],
        },
        'share-target: the POST carried no file — this is what it did carry',
      );
      return redirectTo(res, { error: 'no_file' });
    }

    const mimeType = sniffContentType(file.buffer);
    if (!mimeType) {
      logger.warn(
        { declaredMimeType: file.mimetype, originalName: file.originalname, fieldName: file.fieldname },
        'share-target: rejected a file whose content did not match any allowed signature',
      );
      return redirectTo(res, { error: 'unsupported_type' });
    }

    const id = stageFile({
      buffer: file.buffer,
      mimeType,
      originalName: file.originalname,
    });

    return redirectTo(res, { stagedId: id });
  } catch (error) {
    logger.error({ err: error }, 'share-target: failed to stage shared file');
    return redirectTo(res, { error: 'server_error' });
  }
}

/** multer's own errors (e.g. LIMIT_FILE_SIZE) reach this if it's mounted as route-level error middleware. */
export function handleShareTargetUploadError(err, req, res, next) {
  if (!err) return next();
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return redirectTo(res, { error: 'file_too_large' });
  }
  logger.error({ err }, 'share-target: multer error');
  return redirectTo(res, { error: 'server_error' });
}

/**
 * GET /api/body-comp/share-staged/:id
 * Authenticated (requires a real session) — this is the app claiming a
 * staged file for itself, single-use.
 */
export async function getStagedShareFile(req, res) {
  const entry = consumeStagedFile(req.params.id);
  if (!entry) {
    return res.status(404).json({
      success: false,
      error: { code: 'STAGED_UPLOAD_NOT_FOUND', message: 'No staged file for that id — it may have expired or already been claimed.' },
    });
  }

  res.set('Content-Type', entry.mimeType);
  res.set('Cache-Control', 'no-store');
  if (entry.originalName) {
    const safeName = String(entry.originalName).replace(/[\r\n"]/g, '_');
    res.set('Content-Disposition', `inline; filename="${safeName}"`);
  }
  return res.status(200).send(entry.buffer);
}
