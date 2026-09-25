import { createLogger } from '@geeksuite/logger';

// Same level/pretty-print rules every backend uses (LOG_LEVEL env, else
// debug in dev / info in production), shared via @geeksuite/logger.
const logger = createLogger({ name: 'gamegeek' });

export default logger;
export { logger };
