import { describe, it } from '@jest/globals';

// SKIP: controllers/authController.js (local email/password register + login)
// was deleted as part of the Phase 2 hardening pass — notegeek now delegates
// all authentication to basegeek via the suite-wide SSO cookie (see
// routes/auth.js proxy handlers and middleware/authMiddleware.js's use of
// @geeksuite/user/server attachUser). There is no local register/login
// controller left to test. Auth coverage for the SSO path lives in
// __tests__/auth.test.js (auth-isolation suite).
describe.skip('Auth Controller (deleted — local auth removed in SSO migration)', () => {
    it('had no equivalent after the SSO migration', () => {});
});
