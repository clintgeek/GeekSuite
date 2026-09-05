import { z } from 'zod';
import { idParam, bookIdParamsSchema } from './common.js';

/** server.js's own hand-checked list for GET /api/books/:id/download/:format. */
const DOWNLOAD_FORMATS = ['epub', 'azw3', 'mobi'];

/**
 * GET /api/books/:id/download/:format — the handler already lowercases the
 * param and rejects anything outside this exact list by hand
 * (`if (!requestedFormat || !["epub","azw3","mobi"].includes(...))`); this
 * turns that into a typed 400 up front. Same status code (400) on an
 * invalid format, different response body — see the report.
 */
const downloadParamsSchema = z.object({
  id: idParam('id'),
  format: z.string().trim().toLowerCase().pipe(z.enum(DOWNLOAD_FORMATS)),
}).strict();

/**
 * POST /api/books/:id/send-to-kindle reads only `req.params.id`. The
 * "recipient" is `Profile.kindleEmail`, resolved server-side and never taken
 * from the request, and the route only ever looks for an EPUB file — there
 * is no client-supplied "format" here either (that only exists on the
 * download route above). bookIdParamsSchema is the whole of what's
 * checkable on this route.
 */
export { bookIdParamsSchema, downloadParamsSchema, DOWNLOAD_FORMATS };
export default { bookIdParamsSchema, downloadParamsSchema, DOWNLOAD_FORMATS };
