/**
 * TODO_ORDER #22, "books" family: ids as bounded non-empty strings, not
 * ObjectIds (see common.js for the reasoning). Every plain `/api/books/:id/*`
 * route that reads nothing but the id param wires this in directly:
 * `POST .../cover/upload`, `DELETE .../cover`, `POST .../upload`,
 * `GET .../cover`. Re-exported here (rather than importing common.js
 * directly from server.js) so route wiring can name the schema by the
 * family it belongs to — same convention as storygeek's `export.js`.
 */
import { bookIdParamsSchema } from './common.js';

export { bookIdParamsSchema };
export default { bookIdParamsSchema };
