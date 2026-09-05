import { z } from 'zod';
import { bookIdParamsSchema } from './common.js';

/**
 * GET /api/books/:id/search-covers — `q` is an optional freeform title
 * override (falls back to the book's own title when omitted). Bounded
 * generously; this is a search string, not a name field.
 */
const searchCoversQuerySchema = z.object({
  q: z.string().trim().max(300).optional(),
});

/** server.js's own enum switch for POST /api/books/:id/cover. */
const COVER_PROVIDERS = ['openlibrary', 'googlebooks'];

/**
 * POST /api/books/:id/cover — the JSON "pick a cover found by
 * search-covers" route (provider/coverId/coverUrl). This is the metadata
 * route the task means by "upload metadata fields" — the *other* two cover
 * routes (`POST .../cover/upload`, `POST .../upload`) are raw multipart file
 * streams with no other body fields, so there is nothing to validate there
 * beyond the id param (bookIdParamsSchema) and multer's own file handling.
 *
 * coverId comes straight from the search-covers response, which can hand
 * back either an OpenLibrary numeric cover id or a Google Books string id —
 * accept both shapes rather than forcing a coercion neither provider needs.
 * coverUrl's own `http(s)://` shape check stays in the handler (it 502s on
 * download failure, a different concern from "is this a string"); zod only
 * bounds the type/length here.
 */
const manualCoverBodySchema = z.object({
  provider: z.enum(COVER_PROVIDERS).optional(),
  coverId: z.union([z.string().trim().min(1).max(128), z.number()]).optional(),
  coverUrl: z.string().trim().max(2000).optional(),
}).strict();

export { bookIdParamsSchema, searchCoversQuerySchema, manualCoverBodySchema, COVER_PROVIDERS };
export default { bookIdParamsSchema, searchCoversQuerySchema, manualCoverBodySchema, COVER_PROVIDERS };
