import { z } from 'zod';

// Mirrors basegeek's VALID_APPS (DOCS/CONTEXT.md "SSO — Valid Apps") — the
// app names basegeek's refresh endpoint will actually mint a token for.
// Anything else is already going to be rejected by basegeek; catching it
// here just moves that rejection a hop earlier and skips the network call.
const VALID_APPS = [
  'basegeek', 'notegeek', 'bujogeek', 'fitnessgeek',
  'storygeek', 'startgeek', 'flockgeek', 'musicgeek',
  'babelgeek', 'bookgeek',
];

// POST /api/auth/refresh only reads `refreshToken` and `app` off the body
// (routes/auth.js); everything else it needs comes from cookies/headers.
// refreshToken is a JWT forwarded verbatim to basegeek — bounded generously
// (a JWT this size is already pathological) rather than shape-checked, since
// basegeek does the real verification.
const refreshSchema = z.object({
  refreshToken: z.string().max(4096).optional(),
  app: z.enum(VALID_APPS).optional(),
}).strict();

export { refreshSchema, VALID_APPS };
export default { refreshSchema, VALID_APPS };
