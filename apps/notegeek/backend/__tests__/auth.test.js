import { jest, describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import mongoose from 'mongoose';
// The REAL CSRF guard, imported through its own subpath so the
// '@geeksuite/user/server' module mock below cannot stub out the very thing
// the CSRF tests at the bottom of this file are meant to exercise.
import { csrfGuard } from '@geeksuite/user/server/csrfGuard';
import { getAllowedOrigins, HARDCODED_ORIGINS } from '../config/corsOrigins.js';

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
// suite testing notegeek's own wiring (which routes are protected, whether
// req.user._id is what scopes every query, whether one user can ever see
// another's data) rather than re-testing @geeksuite/user's internal HTTP
// plumbing, which is that package's own concern.
//
// Everything downstream of that boundary — protect's model wiring, meHandler,
// the notes/tags/search routers, their controllers, and the real Note/User
// Mongoose models — runs for real against an in-memory MongoDB
// (mongodb-memory-server). That's deliberate: the interesting bugs in "does
// user A ever see user B's notes" live in the controllers' actual Mongo
// filters, not in a mock's call arguments, so this suite proves it end to
// end rather than asserting a stub was called with the right object.

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

// jest.setup.js globally spies mongoose.connect/disconnect/model to no-ops
// (see __tests__/utils/testUtils.js's mockMongoose) so the rest of the suite
// can mock the Note/User models directly without touching a real database.
// This file needs the *real* mongoose so it can run genuine queries against
// an in-memory MongoDB instead — restore the spied methods before anything
// below imports models/Note.js or models/User.js, both of which call
// mongoose.model(...) at import time.
if (typeof mongoose.connect.mockRestore === 'function') mongoose.connect.mockRestore();
if (typeof mongoose.disconnect.mockRestore === 'function') mongoose.disconnect.mockRestore();
if (typeof mongoose.model.mockRestore === 'function') mongoose.model.mockRestore();

const { MongoMemoryServer } = await import('mongodb-memory-server');
const { protect } = await import('../middleware/authMiddleware.js');
const { meHandler } = await import('@geeksuite/user/server');
const { default: noteRoutes } = await import('../routes/notes.js');
const { default: tagRoutes } = await import('../routes/tags.js');
const { default: searchRoutes } = await import('../routes/search.js');
const { default: Note } = await import('../models/Note.js');

let mongod;

function buildApp() {
    const app = express();
    app.use(express.json());
    // Stand in for pino-http's req.log, which controllers use in their catch
    // blocks (server.js mounts pino-http for real; this test app doesn't need
    // real structured logging).
    app.use((req, res, next) => {
        req.log = { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} };
        next();
    });
    // Canonical cookie-first auth check — mirrors server.js's GET /api/me.
    app.get('/api/me', protect, meHandler());
    app.use('/api/notes', noteRoutes);
    app.use('/api/tags', tagRoutes);
    app.use('/api/search', searchRoutes);
    return app;
}

const app = buildApp();

// Same wiring as server.js: csrfGuard, built from the app's real allow-list,
// ahead of the routes. server.js builds its app inside start() (which
// connects Mongo and binds a port at import time), so it cannot be imported
// here — which is why the allow-list lives in its own module rather than
// inline in server.js.
function buildGuardedApp() {
    const guarded = express();
    guarded.use(csrfGuard({ allowedOrigins: getAllowedOrigins(), appName: 'notegeek-test' }));
    guarded.use(express.json());
    guarded.use((req, res, next) => {
        req.log = { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} };
        next();
    });
    guarded.get('/api/me', protect, meHandler());
    guarded.use('/api/notes', noteRoutes);
    return guarded;
}

const guardedApp = buildGuardedApp();

const cookieFor = (token) => [`geek_token=${token}`];

beforeAll(async () => {
    // mongodb-memory-server's default binary version needs libssl1.1, which
    // this box doesn't have (only libssl3) — pin to a cached 7.0.x binary
    // that links against OpenSSL 3 instead of triggering a download. Modern
    // mongod builds dropped the package's default 'ephemeralForTest' storage
    // engine, so wiredTiger has to be requested explicitly too.
    mongod = await MongoMemoryServer.create({
        binary: { version: '7.0.14' },
        instance: { storageEngine: 'wiredTiger' },
    });
    await mongoose.connect(mongod.getUri(), { dbName: 'notegeek-auth-isolation-test' });
    // Ensure the text index (used by /api/search) actually exists before any
    // test runs a $text query against it — index builds happen in the
    // background otherwise.
    await Note.init();
}, 60000);

afterAll(async () => {
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
});

beforeEach(async () => {
    await Note.deleteMany({});
});

// =============================================================================
// Unauthenticated access
// =============================================================================
describe('unauthenticated access', () => {
    it('GET /api/me with no cookie returns 401', async () => {
        const res = await request(app).get('/api/me');
        expect(res.status).toBe(401);
    });

    it('GET /api/notes with no cookie returns 401', async () => {
        const res = await request(app).get('/api/notes');
        expect(res.status).toBe(401);
    });

    it('GET /api/tags with no cookie returns 401', async () => {
        const res = await request(app).get('/api/tags');
        expect(res.status).toBe(401);
    });

    it('GET /api/search?q=x with no cookie returns 401', async () => {
        const res = await request(app).get('/api/search').query({ q: 'x' });
        expect(res.status).toBe(401);
    });
});

// =============================================================================
// Invalid tokens (malformed / expired / wrong-secret — all just "basegeek says no",
// see the file-level comment above for why these collapse to one case here)
// =============================================================================
describe('invalid tokens', () => {
    it('a token basegeek does not recognize (malformed/expired/wrong-secret) yields 401', async () => {
        const res = await request(app)
            .get('/api/notes')
            .set('Cookie', cookieFor('garbage-not-a-real-token'));

        expect(res.status).toBe(401);
    });

    it('an empty bearer token yields 401', async () => {
        const res = await request(app)
            .get('/api/notes')
            .set('Authorization', 'Bearer ');

        expect(res.status).toBe(401);
    });

    it('a well-formed-looking but unrecognized token on the canonical /api/me check also yields 401', async () => {
        const res = await request(app)
            .get('/api/me')
            .set('Cookie', cookieFor('eyJhbGciOiJIUzI1NiJ9.forged.payload'));

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

// =============================================================================
// Cross-user data isolation
// =============================================================================
describe('cross-user data isolation', () => {
    let aliceNoteId;
    let bobNoteId;

    beforeEach(async () => {
        const aliceRes = await request(app)
            .post('/api/notes')
            .set('Cookie', cookieFor('token-for-alice'))
            .send({ content: 'Alice secret pancake recipe', title: 'Pancakes', tags: ['recipes/breakfast'] });
        expect(aliceRes.status).toBe(201);
        aliceNoteId = aliceRes.body._id;

        const bobRes = await request(app)
            .post('/api/notes')
            .set('Cookie', cookieFor('token-for-bob'))
            .send({ content: 'Bob secret waffle recipe', title: 'Waffles', tags: ['recipes/breakfast-bob'] });
        expect(bobRes.status).toBe(201);
        bobNoteId = bobRes.body._id;
    });

    it("alice's note list excludes bob's note", async () => {
        const res = await request(app).get('/api/notes').set('Cookie', cookieFor('token-for-alice'));

        expect(res.status).toBe(200);
        const ids = res.body.notes.map((n) => n._id);
        expect(ids).toContain(aliceNoteId);
        expect(ids).not.toContain(bobNoteId);
    });

    it("bob's note list excludes alice's note", async () => {
        const res = await request(app).get('/api/notes').set('Cookie', cookieFor('token-for-bob'));

        expect(res.status).toBe(200);
        const ids = res.body.notes.map((n) => n._id);
        expect(ids).toContain(bobNoteId);
        expect(ids).not.toContain(aliceNoteId);
    });

    it("alice's tag list excludes bob's tags", async () => {
        const res = await request(app).get('/api/tags').set('Cookie', cookieFor('token-for-alice'));

        expect(res.status).toBe(200);
        expect(res.body).toContain('recipes/breakfast');
        expect(res.body).not.toContain('recipes/breakfast-bob');
    });

    it("alice's search for a term only in bob's note returns nothing", async () => {
        const res = await request(app)
            .get('/api/search')
            .query({ q: 'waffle' })
            .set('Cookie', cookieFor('token-for-alice'));

        expect(res.status).toBe(200);
        expect(res.body.find((n) => n._id === bobNoteId)).toBeUndefined();
    });

    it("alice's search for a shared term ('secret') never surfaces bob's note", async () => {
        const res = await request(app)
            .get('/api/search')
            .query({ q: 'secret' })
            .set('Cookie', cookieFor('token-for-alice'));

        expect(res.status).toBe(200);
        const ids = res.body.map((n) => n._id);
        expect(ids).toContain(aliceNoteId);
        expect(ids).not.toContain(bobNoteId);
    });

    it("bob cannot read alice's note by id (actual contract: 404, not 403)", async () => {
        const res = await request(app)
            .get(`/api/notes/${aliceNoteId}`)
            .set('Cookie', cookieFor('token-for-bob'));

        expect(res.status).toBe(404);
        expect(res.body.message).toMatch(/not found|does not belong/i);
    });

    it("bob cannot update alice's note by id (actual contract: 404)", async () => {
        const res = await request(app)
            .put(`/api/notes/${aliceNoteId}`)
            .set('Cookie', cookieFor('token-for-bob'))
            .send({ title: 'Hijacked' });

        expect(res.status).toBe(404);

        // Confirm alice's note was genuinely untouched, not just that the
        // response code looked right.
        const aliceCheck = await request(app)
            .get(`/api/notes/${aliceNoteId}`)
            .set('Cookie', cookieFor('token-for-alice'));
        expect(aliceCheck.body.title).toBe('Pancakes');
    });

    it("bob cannot delete alice's note by id (actual contract: 404)", async () => {
        const res = await request(app)
            .delete(`/api/notes/${aliceNoteId}`)
            .set('Cookie', cookieFor('token-for-bob'));

        expect(res.status).toBe(404);

        const stillThere = await Note.findById(aliceNoteId);
        expect(stillThere).not.toBeNull();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// CSRF origin guard (TODO_ORDER #12)
//
// server.js mounts @geeksuite/user's csrfGuard() with the allow-list from
// config/corsOrigins.js — the same list cors() gets, so the two cannot drift.
// buildGuardedApp() above reproduces that wiring around the real notes
// router and the real Note model on in-memory Mongo, so these assertions are
// about whether the write actually happened, not just about a status code.
//
// Unit coverage for every branch of the guard itself (Referer fallback,
// opaque origins, CSRF_GUARD=off/report, empty allow-list) lives in
// packages/user/src/server/__tests__/csrfGuard.test.js.
// ─────────────────────────────────────────────────────────────────────────────

describe('CSRF origin guard', () => {
    const OWN_ORIGIN = 'https://notegeek.clintgeek.com';
    const EVIL_ORIGIN = 'https://evil.example';

    beforeEach(async () => {
        await Note.deleteMany({});
    });

    it("notegeek's own production origin is on the list the guard is built from", () => {
        expect(HARDCODED_ORIGINS).toContain(OWN_ORIGIN);
        expect(getAllowedOrigins({})).toEqual(HARDCODED_ORIGINS);
        expect(getAllowedOrigins({ CORS_ORIGINS: 'https://a.test, https://b.test' }))
            .toEqual(['https://a.test', 'https://b.test']);
    });

    it("a note created from notegeek's own origin is written", async () => {
        const res = await request(guardedApp)
            .post('/api/notes')
            .set('Cookie', cookieFor('token-for-alice'))
            .set('Origin', OWN_ORIGIN)
            .send({ content: 'from the real app', title: 'Allowed' });

        expect(res.status).toBe(201);
        expect(await Note.countDocuments({})).toBe(1);
    });

    it('the same POST from a third-party page is rejected and writes nothing', async () => {
        const res = await request(guardedApp)
            .post('/api/notes')
            .set('Cookie', cookieFor('token-for-alice'))
            .set('Origin', EVIL_ORIGIN)
            .send({ content: 'injected by evil.example', title: 'Pwned' });

        expect(res.status).toBe(403);
        expect(res.body).toEqual({ error: 'csrf_origin_rejected' });
        expect(await Note.countDocuments({})).toBe(0);
    });

    it('a foreign Referer with no Origin is rejected too', async () => {
        const res = await request(guardedApp)
            .post('/api/notes')
            .set('Cookie', cookieFor('token-for-alice'))
            .set('Referer', `${EVIL_ORIGIN}/attack.html`)
            .send({ content: 'injected', title: 'Pwned' });

        expect(res.status).toBe(403);
        expect(await Note.countDocuments({})).toBe(0);
    });

    it('a cookie-authenticated mutation with no Origin and no Referer passes', async () => {
        const res = await request(guardedApp)
            .post('/api/notes')
            .set('Cookie', cookieFor('token-for-alice'))
            .send({ content: 'from curl', title: 'No headers' });

        expect(res.status).toBe(201);
    });

    it('a GET from a foreign origin is not blocked by the guard — mutations only', async () => {
        await request(guardedApp)
            .post('/api/notes')
            .set('Cookie', cookieFor('token-for-alice'))
            .set('Origin', OWN_ORIGIN)
            .send({ content: 'seed', title: 'Seed' });

        const res = await request(guardedApp)
            .get('/api/notes')
            .set('Cookie', cookieFor('token-for-alice'))
            .set('Origin', EVIL_ORIGIN);

        expect(res.status).toBe(200);
    });

    it('an unauthenticated mutation falls through to the normal 401, not a 403', async () => {
        const res = await request(guardedApp)
            .post('/api/notes')
            .set('Origin', EVIL_ORIGIN)
            .send({ content: 'anon', title: 'Anon' });

        expect(res.status).toBe(401);
    });
});
