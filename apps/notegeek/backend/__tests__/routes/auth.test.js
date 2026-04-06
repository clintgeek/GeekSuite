import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// --- Mocks ---
const mockAxios = {
    get: vi.fn(),
    post: vi.fn(),
};
vi.mock('axios', () => ({
    default: mockAxios,
}));

const mockJwt = {
    verify: vi.fn(),
};
vi.mock('jsonwebtoken', () => ({
    default: mockJwt,
}));

// Setup mock controller to avoid needing real auth logic for /register, /login
vi.mock('../../controllers/auth.js', () => ({
    registerUser: (req, res) => res.status(200).json({ msg: 'mocked register' }),
    loginUser: (req, res) => res.status(200).json({ msg: 'mocked login' }),
}));

// Note: we'll mock User.findById and limit what it needs to do for validation
const mockUserModel = {
    findById: vi.fn(),
    create: vi.fn(),
};
vi.mock('../../models/User.js', () => ({
    default: mockUserModel,
}));

// Import after mocks
const { default: authRoutes } = await import('../../routes/auth.js');

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

describe('Auth Routes (Inline Handlers)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.USERGEEK_API_URL = 'https://mock.basegeek.com';
        process.env.JWT_SECRET = 'testsecret';
    });

    afterEach(() => {
        delete process.env.USERGEEK_API_URL;
        delete process.env.JWT_SECRET;
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
        it('should proxy to baseGeek and forward cookies', async () => {
            mockAxios.post.mockResolvedValueOnce({
                status: 200,
                data: { accessToken: 'new_token' },
                headers: { 'set-cookie': ['geek_token=new_token; HttpOnly'] },
            });

            const res = await request(app)
                .post('/api/auth/refresh')
                .set('Cookie', ['some_cookie=value']);

            expect(mockAxios.post).toHaveBeenCalledWith(
                'https://mock.basegeek.com/api/auth/refresh',
                { app: 'notegeek' },
                { headers: { Cookie: 'some_cookie=value', Authorization: '' } }
            );
            expect(res.status).toBe(200);
            expect(res.headers['set-cookie']).toEqual(['geek_token=new_token; HttpOnly']);
            expect(res.body).toEqual({ accessToken: 'new_token' });
        });

        it('should return 502 if baseGeek is unreachable', async () => {
            mockAxios.post.mockRejectedValueOnce(new Error('Network Error'));

            const res = await request(app).post('/api/auth/refresh');

            expect(res.status).toBe(502);
        });
    });

    // =========================================================================
    // POST /validate-sso
    // =========================================================================
    describe('POST /validate-sso', () => {
        it('should validate token and return existing user', async () => {
            mockJwt.verify.mockReturnValueOnce({ id: 'user123', email: 'test@example.com' });

            const mockUser = { _id: 'user123', email: 'test@example.com', createdAt: '2023-01-01' };
            const selectMock = vi.fn().mockResolvedValueOnce(mockUser);
            mockUserModel.findById.mockReturnValueOnce({ select: selectMock });

            const res = await request(app)
                .post('/api/auth/validate-sso')
                .send({ token: 'valid_sso_token' });

            expect(mockJwt.verify).toHaveBeenCalledWith('valid_sso_token', 'testsecret');
            expect(mockUserModel.findById).toHaveBeenCalledWith('user123');
            expect(selectMock).toHaveBeenCalledWith('-password');
            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                _id: 'user123',
                email: 'test@example.com',
                createdAt: '2023-01-01',
                token: 'valid_sso_token',
            });
        });

        it('should create user if not found during SSO', async () => {
            mockJwt.verify.mockReturnValueOnce({ id: 'newuser123', email: 'new@example.com' });

            const selectMock = vi.fn().mockResolvedValueOnce(null);
            mockUserModel.findById.mockReturnValueOnce({ select: selectMock });

            const newMockUser = { _id: 'newuser123', email: 'new@example.com', createdAt: 'new-date' };
            mockUserModel.create.mockResolvedValueOnce(newMockUser);

            const res = await request(app)
                .post('/api/auth/validate-sso')
                .send({ token: 'new_sso_token' });

            expect(mockUserModel.create).toHaveBeenCalledWith({
                email: 'new@example.com',
                passwordHash: 'SSO_USER',
            });
            expect(res.status).toBe(200);
            expect(res.body.email).toBe('new@example.com');
        });

        it('should return 400 if no token is provided', async () => {
            const res = await request(app).post('/api/auth/validate-sso').send({});

            expect(res.status).toBe(400);
            expect(res.body.message).toBe('Token is required');
        });

        it('should return 401 if invalid JWT (JsonWebTokenError)', async () => {
            const jwtError = new Error('invalid signature');
            jwtError.name = 'JsonWebTokenError';
            mockJwt.verify.mockImplementationOnce(() => { throw jwtError; });

            const res = await request(app)
                .post('/api/auth/validate-sso')
                .send({ token: 'bad_token' });

            expect(res.status).toBe(401);
            expect(res.body.message).toBe('Invalid token');
        });

        it('should return 401 if expired JWT (TokenExpiredError)', async () => {
            const jwtError = new Error('jwt expired');
            jwtError.name = 'TokenExpiredError';
            mockJwt.verify.mockImplementationOnce(() => { throw jwtError; });

            const res = await request(app)
                .post('/api/auth/validate-sso')
                .send({ token: 'expired_token' });

            expect(res.status).toBe(401);
            expect(res.body.message).toBe('Token expired');
        });
    });

    // Note: getCookieFromHeader and forwardSetCookieHeaders are private to the module,
    // but they are implicitly fully tested via the GET /me and POST /logout requests.
});
