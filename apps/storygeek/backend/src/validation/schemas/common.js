import { z } from 'zod';

/**
 * Route params that identify a Mongo document by `_id` (storyId,
 * characterId, ...). Checked only as a non-empty, bounded string — NOT as a
 * 24-char hex ObjectId. A malformed id still reaches whatever the route
 * already does with one (Mongoose CastError -> existing catch block, or
 * `findById` returning null -> the route's own 404) instead of validation
 * reinterpreting "not found" as "bad request". Same call as bujogeek's zod
 * pass (apps/basegeek/packages/api/src/graphql/bujogeek/validation.js).
 */
const idParam = (label = 'id') => z.string().trim().min(1, `${label} is required`).max(64);

/** `req.params` shape shared by every story-scoped route (`:storyId` only). */
const storyIdParamsSchema = z.object({ storyId: idParam('storyId') }).strict();

/** A name-ish string bound: character/item names, titles, genres. */
const boundedName = (max = 200) => z.string().trim().min(1).max(max);

/** A free-text content field: descriptions, prompts, narration input. */
const boundedText = (max) => z.string().max(max);

export { idParam, storyIdParamsSchema, boundedName, boundedText };
export default { idParam, storyIdParamsSchema, boundedName, boundedText };
