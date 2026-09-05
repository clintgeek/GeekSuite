import { z } from 'zod';

/**
 * POST /api/import/calibre/rescan reads only `req.query.limit` — no body at
 * all. Previously any non-positive or non-numeric value silently fell back
 * to a default of 1000 rows (`Number(limitParam) > 0 ? Number(limitParam) :
 * 1000`); a caller sending garbage here now gets a clean 400 instead of a
 * silently-substituted default — a real, deliberate behavior change (see
 * the report). Omitting `limit` entirely still falls through to that same
 * 1000-row default, unchanged.
 */
const calibreRescanQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100000).optional(),
});

/**
 * POST /api/import/goodreads (multipart CSV) and
 * POST /api/import/goodreads/dedupe read no additional JSON/text fields
 * today — the import route only ever looks at `req.file`, and dedupe takes
 * no input at all. TODO_ORDER #22's general "Goodreads options, dedupe
 * flags" guidance for this family doesn't map onto bookgeek's actual code:
 * there are no such options to validate without inventing a field neither
 * route reads. Nothing added here beyond the existing "no file uploaded" /
 * "file is empty" / CSV-parse-failure checks already in importRoutes.js.
 */

export { calibreRescanQuerySchema };
export default { calibreRescanQuerySchema };
