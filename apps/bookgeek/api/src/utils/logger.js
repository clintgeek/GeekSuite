import { createLogger } from "@geeksuite/logger";

// Same level/pretty-print rules every backend used (LOG_LEVEL env, else
// debug in dev / info in production), now shared via @geeksuite/logger.
// `name` is new — additive `name` binding on every log line, doesn't change
// any existing field.
export const logger = createLogger({ name: "bookgeek" });
