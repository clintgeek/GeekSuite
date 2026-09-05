import { jest, describe, it, expect } from '@jest/globals';
import request from 'supertest';
import express from 'express';

// =============================================================================
// Auth-isolation integration suite
// =============================================================================
//
// notegeek never verifies the SSO JWT itself. `protect` (middleware/authMiddleware.js)
// is @geeksuite/user/server's attachUser({ model: User }), which:
//   1. reads the geek_token cookie (or an Authorization: Bearer header),
//   2. forwards it to basegeek's GET /api/users/me via axios,
//   3. trusts whatever basegeek says (200 + user => authenticated; 401/403 => rejected;
//      unreachable => 502), and
//   4. sets req.user to the normalized SSO identity (req.user._id).
//
// So "malformed", "expired", and "wrong-secret" tokens are not locally
// distinguishable cases here — notegeek has no secret to check them against.
// They all reduce to "basegeek's /api/users/me said no". @geeksuite/user's
// attachUser is what actually makes that HTTP call (via axios, from its own
// CJS module inside packages/user) — that call is internal to a *different*
// workspace package's implementation, not something notegeek's own code
// does, and jest's ESM mock registry (jest.unstable_mockModule) cannot
// intercept a bare `require('axios')` made from inside another package's
// CJS module graph. So the seam this suite mocks is the package boundary
// notegeek actually depends on — @geeksuite/user/server itself — with a
// faithful stand-in for attachUser's observable contract (cookie/header in,
// 401 on missing/invalid token, req.user set on success). That keeps this
// suite testing notegeek's own wiring around the canonical /api/me check
// rather than re-testing @geeksuite/user's internal HTTP plumbing, which is
// that package's own concern.
//
// 2026-09-05: the legacy REST notes/tags/search routers, their controllers,
// and the duplicate Note model were deleted (dead since the frontend moved
// fully onto GraphQL — see DOCS/SUITE_TODO.md's GraphQL consolidation audit).
// This suite used to run its cross-user-isolation and CSRF-origin-guard
// assertions through those routers as a real, Mongo-backed vehicle. With the
// routers gone there is nothing left in notegeek to scope per-user Mongo
// queries for (that guarantee now lives in basegeek's gateway resolvers,
// which have their own ownership test — see
// apps/basegeek/packages/api/src/__tests__/notegeekOwnership.test.js), and
// the CSRF guard's own branch coverage already lives at the package level in
// packages/user/src/server/__tests__/csrfGuard.test.js. So this file keeps
// only what is still notegeek's own concern: does /api/me require a valid
// identity and report it correctly.

const USER_A = {
    _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    username: 'alice',
    email: 'alice@example.com',
    app: 'notegeek',
};
const USER_B = {
    _id: 'bbbbbbbbbbbbbbbbbbbbbbbb',
    username: 'bob',
    email: 'bob@example.com',
    app: 'notegeek',
};

// Simulated basegeek verdicts: only these two bearer tokens are "valid".
// Anything else (garbage, an expired-looking string, a token signed with the
// wrong secret) is indistinguishable to notegeek and comes back as "invalid",
// exactly like a genuinely malformed/expired token would from the real
// attachUser talking to the real basegeek.
const VALID_TOKENS = {
    'token-for-alice': USER_A,
    'token-for-bob': USER_B,
};

function getBearerToken(req) {
    const authHeader = req.headers?.authorization;
    if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);
    const cookieHeader = req.headers?.cookie;
    if (cookieHeader) {
        for (const part of cookieHeader.split(';')) {
            const [key, ...rest] = part.trim().split('=');
            if (key === 'geek_token') return rest.join('=');
        }
    }
    return null;
}

jest.unstable_mockModule('@geeksuite/user/server', () => ({
    // Mirrors packages/user/src/server/attachUser.js's observable contract
    // for the required-auth case notegeek actually uses (no `required:false`
    // callers in this app).
    attachUser: () => (req, res, next) => {
        const token = getBearerToken(req);
        if (!token) {
            return res.status(401).json({ message: 'Authentication token required' });
        }
        const user = VALID_TOKENS[token];
        if (!user) {
            return res.status(401).json({ message: 'Invalid or expired token' });
        }
        req.geek = { user, localUser: null };
        req.user = user;
        return next();
    },
    // Mirrors packages/user/src/server/meHandler.js exactly (that file makes
    // no external calls, so re-implementing it here carries no real risk of
    // drifting from production behavior).
    meHandler: () => (req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        if (!req.geek?.user) {
            return res.status(401).json({ message: 'Not authenticated' });
        }
        return res.json({ user: { ...req.geek.user } });
    },
}));

const { protect } = await import('../middleware/authMiddleware.js');
const { meHandler } = await import('@geeksuite/user/server');

function buildApp() {
    const app = express();
    app.use(express.json());
    // Canonical cookie-first auth check — mirrors server.js's GET /api/me.
    app.get('/api/me', protect, meHandler());
    return app;
}

const app = buildApp();

const cookieFor = (token) => [`geek_token=${token}`];

// =============================================================================
// Unauthenticated access
// =============================================================================
describe('unauthenticated access', () => {
    it('GET /api/me with no cookie returns 401', async () => {
        const res = await request(app).get('/api/me');
        expect(res.status).toBe(401);
    });
});

// =============================================================================
// Invalid tokens (malformed / expired / wrong-secret — all just "basegeek says no",
// see the file-level comment above for why these collapse to one case here)
// =============================================================================
describe('invalid tokens', () => {
    it('a well-formed-looking but unrecognized token on the canonical /api/me check yields 401', async () => {
        const res = await request(app)
            .get('/api/me')
            .set('Cookie', cookieFor('eyJhbGciOiJIUzI1NiJ9.forged.payload'));

        expect(res.status).toBe(401);
    });

    it('an empty bearer token yields 401', async () => {
        const res = await request(app)
            .get('/api/me')
            .set('Authorization', 'Bearer ');

        expect(res.status).toBe(401);
    });
});

// =============================================================================
// Valid identity
// =============================================================================
describe('valid identity', () => {
    it('GET /api/me with a valid cookie returns 200 with the caller\'s identity', async () => {
        const res = await request(app)
            .get('/api/me')
            .set('Cookie', cookieFor('token-for-alice'));

        expect(res.status).toBe(200);
        expect(res.body.user).toEqual(
            expect.objectContaining({ _id: USER_A._id, username: 'alice', email: 'alice@example.com' })
        );
    });

    it('a valid Authorization header works as well as a cookie', async () => {
        const res = await request(app)
            .get('/api/me')
            .set('Authorization', 'Bearer token-for-bob');

        expect(res.status).toBe(200);
        expect(res.body.user).toEqual(expect.objectContaining({ _id: USER_B._id, username: 'bob' }));
    });
});
