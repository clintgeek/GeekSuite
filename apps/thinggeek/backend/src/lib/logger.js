import { createLogger } from '@geeksuite/logger';

// Same level/pretty-print rules every backend uses (LOG_LEVEL env, else
// debug in dev / info in production), shared via @geeksuite/logger.
//
// ThingGeek rule: never log file contents, filenames, captions, or any
// identifier (serial, VIN, sha256, ids) — counts and error codes only.
const logger = createLogger({ name: 'thinggeek' });

export default logger;
export { logger };
