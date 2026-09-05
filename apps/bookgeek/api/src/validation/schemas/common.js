import { z } from 'zod';

/**
 * Route params that identify a Book by `_id`, checked only as a non-empty,
 * bounded string — NOT as a 24-char hex ObjectId. A malformed id still
 * reaches whatever the route already does with one (a Mongoose CastError
 * caught by the route's own try/catch -> 500, same as today, or
 * `findById` returning null -> the route's own 404) instead of validation
 * reinterpreting "not found" as "bad request". Same call as storygeek's zod
 * pass (apps/storygeek/backend/src/validation/schemas/common.js) and
 * fitnessgeek's before it.
 */
const idParam = (label = 'id') => z.string().trim().min(1, `${label} is required`).max(64);

/**
 * `req.params` shape shared by every plain `/api/books/:id/*` route that
 * takes no other params: `POST .../cover/upload`, `DELETE .../cover`,
 * `POST .../upload`, `GET .../cover`, `GET .../search-covers`,
 * `POST .../enrich`, `POST .../send-to-kindle`.
 */
const bookIdParamsSchema = z.object({ id: idParam('id') }).strict();

export { idParam, bookIdParamsSchema };
export default { idParam, bookIdParamsSchema };
