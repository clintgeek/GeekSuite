import { attachUser } from '@geeksuite/user/server';

/**
 * Session check through basegeek (the suite default). `validateSession` is
 * injectable so tests can answer the question in-process.
 */
export function createAuthenticate({ validateSession } = {}) {
  return attachUser(validateSession ? { validateSession } : {});
}

export default { createAuthenticate };
