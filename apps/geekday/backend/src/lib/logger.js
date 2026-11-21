import { createLogger } from '@geeksuite/logger';

// Same level/pretty-print rules every backend uses (LOG_LEVEL env, else
// debug in dev / info in production), shared via @geeksuite/logger.
// GeekDay has no database and stores nothing: log paths and codes, never
// task text or handwriting.
const logger = createLogger({ name: 'geekday' });

export default logger;
export { logger };
