import { createLogger } from '@geeksuite/logger';

// Same level/pretty-print rules every backend uses (LOG_LEVEL env, else
// debug in dev / info in production), shared via @geeksuite/logger.
//
// NewsGeek rule: log source slugs, feed hosts, counts and status codes —
// never article text, and never a full feed URL's query string beyond what
// the source list already shows on the Sources screen.
const logger = createLogger({ name: 'newsgeek' });

export default logger;
export { logger };
