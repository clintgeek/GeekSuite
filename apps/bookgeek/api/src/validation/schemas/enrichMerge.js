import { z } from 'zod';
import { idParam, bookIdParamsSchema } from './common.js';

/**
 * POST /api/books/:id/enrich reads only `req.params.id` — no body fields at
 * all (it enriches the book already in hand from Calibre + OpenLibrary,
 * nothing the caller supplies). bookIdParamsSchema, shared with every other
 * plain `:id` route, is the whole of what's checkable here.
 *
 * POST /api/books/merge takes exactly two ids in the body today — a
 * `primaryId` and a `secondaryId`, not an array. TODO_ORDER #22's general
 * "id arrays <= 200, strict" guidance for this family doesn't map onto the
 * route as actually written; bounded single ids is the real shape, and the
 * handler's own "must be different ids" / "must be exactly one
 * Goodreads-import book" business-logic checks stay untouched below this.
 */
const mergeBodySchema = z.object({
  primaryId: idParam('primaryId'),
  secondaryId: idParam('secondaryId'),
}).strict();

export { bookIdParamsSchema, mergeBodySchema };
export default { bookIdParamsSchema, mergeBodySchema };
