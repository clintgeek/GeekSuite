import { z } from 'zod';

/** Mirrors deviceBasket.js's own MAX_BOOKS_PER_BASKET (kept in sync by hand — see report). */
const MAX_BOOKS_PER_BASKET = 50;

/**
 * POST /api/device-baskets — shape only, per TODO_ORDER #22's instruction
 * for this family. The handler's own per-item `mongoose.isValidObjectId()`
 * check plus its Book-existence lookup (which reports exactly which ids are
 * missing) stay exactly as they are below this — this just rejects a
 * malformed body (wrong types, an oversized array, a non-array `bookIds`)
 * before that work runs. `device` is validated as a bounded string here; the
 * handler's own `DEVICE_FORMAT_MAP` lookup still owns *which* device names
 * are actually supported, unchanged.
 *
 * Device *word* normalisation (`normalizeDeviceWord`/`isValidDeviceWord` in
 * deviceBasket.js) belongs to the public `POST /download-basket` word
 * lookup, a different, unauthenticated route that deliberately never 400s
 * on bad input (it always replies with the same neutral "no active basket"
 * page, so a scanner can't distinguish a bad word from a wrong one) — left
 * untouched, per the task.
 */
const createBasketBodySchema = z.object({
  device: z.string().trim().min(1).max(32).optional(),
  bookIds: z
    .array(z.string().trim().min(1).max(64))
    .min(1, 'bookIds is required')
    .max(MAX_BOOKS_PER_BASKET, `bookIds may contain at most ${MAX_BOOKS_PER_BASKET} entries`),
}).strict();

export { createBasketBodySchema, MAX_BOOKS_PER_BASKET };
export default { createBasketBodySchema, MAX_BOOKS_PER_BASKET };
