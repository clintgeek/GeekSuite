/**
 * The request-scoped logger, or the process logger if there isn't one.
 *
 * `req.log` is attached by `createHttpLogger` in `src/app.js`. A route handler
 * that calls `req.log.error(...)` inside its own `catch` therefore THROWS when
 * its router is mounted without that middleware — and a catch block that throws
 * sends no response at all, so the request hangs until the client gives up
 * rather than answering the 500 the handler meant to send. (The same shape bit
 * the app-level error handler; see the note beside it in `app.js`.)
 *
 * Using this keeps the request id in the log line where one exists, and keeps
 * the error path from becoming its own error where one doesn't.
 */
import logger from '../config/logger.js';

const reqLogger = (req) => (req && req.log) || logger;

export { reqLogger };
export default reqLogger;
