import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';

// --- Mocks ---
// This file was originally written against vitest (import { vi } from 'vitest')
// even though the package's configured test runner is jest — vitest's `vi`
// pollutes jest's global matcher registry when both are loaded in the same
// process, crashing every suite in the run. Converted to jest's own ESM
// mocking API (jest.unstable_mockModule + dynamic import) to match the rest
// of this test suite.
const mockAxios = {
    get: jest.fn(),
    post: jest.fn(),
};
jest.unstable_mockModule('axios', () => ({
    default: mockAxios,
}));

// NOTE: routes/auth.js only proxies to baseGeek via axios (/me, /logout,
// /refresh). controllers/auth.js, jsonwebtoken, and models/User.js — mocked
// in the original vitest version of this file for a /validate-sso route and
// local register/login controllers — were all deleted in the Phase 2
// hardening pass and are no longer imported by routes/auth.js at all, so
// mocking them here is unnecessary (and mocking a module that no longer
// exists would break module resolution, the way it did for the deleted
// Folders controller — see __tests__/controllers/folders.test.js).

// Import after mocks
const { default: authRoutes } = await import('../../routes/auth.js');

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

describe('Auth Routes (Inline Handlers)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        process.env.USERGEEK_API_URL = 'https://mock.basegeek.com';
    });

    afterEach(() => {
        delete process.env.USERGEEK_API_URL;
    });

    // =========================================================================
    // GET /me
    // =========================================================================
    describe('GET /me', () => {
        it('should forward token from cookie and return baseGeek response', async () => {
            mockAxios.get.mockResolvedValueOnce({ status: 200, data: { user: 'test' } });

            const res = await request(app)
                .get('/api/auth/me')
                .set('Cookie', ['geek_token=abc123token']);

            expect(mockAxios.get).toHaveBeenCalledWith('https://mock.basegeek.com/api/users/me', {
                headers: { Authorization: 'Bearer abc123token' },
            });
            expect(res.status).toBe(200);
            expect(res.body).toEqual({ user: 'test' });
        });

        it('should forward Bearer token from header if no cookie', async () => {
            mockAxios.get.mockResolvedValueOnce({ status: 200, data: { user: 'test2' } });

            const res = await request(app)
                .get('/api/auth/me')
                .set('Authorization', 'Bearer def456token');

            expect(mockAxios.get).toHaveBeenCalledWith('https://mock.basegeek.com/api/users/me', {
                headers: { Authorization: 'Bearer def456token' },
            });
            expect(res.status).toBe(200);
            expect(res.body).toEqual({ user: 'test2' });
        });

        it('should return 401 if no token is provided', async () => {
            const res = await request(app).get('/api/auth/me');

            expect(res.status).toBe(401);
            expect(res.body.success).toBe(false);
            expect(res.body.error.message).toBe('Authentication token required');
            expect(mockAxios.get).not.toHaveBeenCalled();
        });

        it('should return 502 if baseGeek is unreachable (no error.response)', async () => {
            mockAxios.get.mockRejectedValueOnce(new Error('Network Error'));

            const res = await request(app)
                .get('/api/auth/me')
                .set('Cookie', ['geek_token=valid']);

            expect(res.status).toBe(502);
            expect(res.body.message).toContain('Unable to reach baseGeek auth service');
        });

        it('should forward upstream error status and data', async () => {
            const mockUpstreamError = new Error('Upstream failed');
            mockUpstreamError.response = { status: 403, data: { msg: 'Forbidden from upstream' } };
            mockAxios.get.mockRejectedValueOnce(mockUpstreamError);

            const res = await request(app)
                .get('/api/auth/me')
                .set('Cookie', ['geek_token=valid']);

            expect(res.status).toBe(403);
            expect(res.body).toEqual({ msg: 'Forbidden from upstream' });
        });
    });

    // =========================================================================
    // POST /logout
    // =========================================================================
    describe('POST /logout', () => {
        it('should proxy to baseGeek and forward Set-Cookie header', async () => {
            mockAxios.post.mockResolvedValueOnce({
                status: 200,
                data: { msg: 'logged out' },
                headers: { 'set-cookie': ['geek_token=; Max-Age=0'] },
            });

            const res = await request(app)
                .post('/api/auth/logout')
                .set('Cookie', ['geek_token=valid']);

            expect(mockAxios.post).toHaveBeenCalledWith(
                'https://mock.basegeek.com/api/auth/logout',
                {},
                { headers: { Cookie: 'geek_token=valid' } }
            );
            expect(res.status).toBe(200);
            expect(res.body).toEqual({ msg: 'logged out' });
            expect(res.headers['set-cookie']).toEqual(['geek_token=; Max-Age=0']);
        });

        it('should return 502 if baseGeek is unreachable', async () => {
            mockAxios.post.mockRejectedValueOnce(new Error('Network Error'));

            const res = await request(app).post('/api/auth/logout');

            expect(res.status).toBe(502);
            expect(res.body.message).toContain('Unable to reach baseGeek');
        });
    });

    // =========================================================================
    // POST /refresh
    // =========================================================================
    describe('POST /refresh', () => {
        // The handler requires either a body.refreshToken or a
        // `geek_refresh_token` cookie before it will proxy to baseGeek — an
        // arbitrary cookie name (as this test originally sent) short-circuits
        // to a 400 before axios is ever called.
        it('should proxy to baseGeek and forward cookies', async () => {
            mockAxios.post.mockResolvedValueOnce({
                status: 200,
                data: { accessToken: 'new_token' },
                headers: { 'set-cookie': ['geek_token=new_token; HttpOnly'] },
            });

            const res = await request(app)
                .post('/api/auth/refresh')
                .set('Cookie', ['geek_refresh_token=some_refresh_value']);

            expect(mockAxios.post).toHaveBeenCalledWith(
                'https://mock.basegeek.com/api/auth/refresh',
                { app: 'notegeek' },
                { headers: { Cookie: 'geek_refresh_token=some_refresh_value', Authorization: '' } }
            );
            expect(res.status).toBe(200);
            expect(res.headers['set-cookie']).toEqual(['geek_token=new_token; HttpOnly']);
            expect(res.body).toEqual({ accessToken: 'new_token' });
        });

        it('should return 400 if neither refreshToken body nor geek_refresh_token cookie is present', async () => {
            const res = await request(app).post('/api/auth/refresh');

            expect(res.status).toBe(400);
            expect(mockAxios.post).not.toHaveBeenCalled();
        });

        it('should return 502 if baseGeek is unreachable', async () => {
            mockAxios.post.mockRejectedValueOnce(new Error('Network Error'));

            const res = await request(app)
                .post('/api/auth/refresh')
                .set('Cookie', ['geek_refresh_token=some_refresh_value']);

            expect(res.status).toBe(502);
        });
    });

    // Note: getCookieFromHeader and forwardSetCookieHeaders are private to the module,
    // but they are implicitly fully tested via the GET /me and POST /logout requests.
    //
    // The local register/login controller and /validate-sso route this file
    // used to also cover were deleted in the Phase 2 hardening pass — see
    // __tests__/controllers/auth.test.js for the corresponding skip note.
});
