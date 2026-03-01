import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { notFound, errorHandler } from '../../middleware/errorMiddleware.js';

// Helper: create a mock request
const mockReq = (overrides = {}) => ({
    originalUrl: '/api/some-route',
    ...overrides,
});

// Helper: create a mock response
const mockRes = (statusCode = 200) => {
    const res = { statusCode };
    res.status = function (code) { this.statusCode = code; return this; };
    res.json = function (data) { this._json = data; return this; };
    return res;
};

// Helper: mock next function
const mockNext = (fn) => fn || (() => { });

describe('Error Middleware', () => {
    // =========================================================================
    // notFound
    // =========================================================================
    describe('notFound', () => {
        it('should set status to 404 and call next with error', () => {
            const req = mockReq();
            const res = mockRes();
            let nextError = null;
            const next = (err) => { nextError = err; };

            notFound(req, res, next);

            expect(res.statusCode).toBe(404);
            expect(nextError).toBeInstanceOf(Error);
            expect(nextError.message).toContain('/api/some-route');
        });

        it('should include the request URL in the error message', () => {
            const req = mockReq({ originalUrl: '/custom/path' });
            const res = mockRes();
            let nextError = null;
            const next = (err) => { nextError = err; };

            notFound(req, res, next);

            expect(nextError.message).toBe('Not Found - /custom/path');
        });
    });

    // =========================================================================
    // errorHandler
    // =========================================================================
    describe('errorHandler', () => {
        let originalNodeEnv;

        beforeEach(() => {
            originalNodeEnv = process.env.NODE_ENV;
        });

        afterEach(() => {
            process.env.NODE_ENV = originalNodeEnv;
        });

        it('should use the existing status code if not 200', () => {
            const err = new Error('Test Error');
            const req = mockReq();
            const res = mockRes(400);

            errorHandler(err, req, res, mockNext());

            expect(res.statusCode).toBe(400);
        });

        it('should default to 500 if status code is 200', () => {
            const err = new Error('Test Error');
            const req = mockReq();
            const res = mockRes(200);

            errorHandler(err, req, res, mockNext());

            expect(res.statusCode).toBe(500);
        });

        it('should include the error message in the response', () => {
            const err = new Error('Database Failure');
            const req = mockReq();
            const res = mockRes();

            errorHandler(err, req, res, mockNext());

            expect(res._json).toBeDefined();
            expect(res._json.message).toBe('Database Failure');
        });

        it('should hide stack trace in production', () => {
            process.env.NODE_ENV = 'production';
            const err = new Error('Production Error');
            err.stack = 'stack_trace_here';
            const req = mockReq();
            const res = mockRes();

            errorHandler(err, req, res, mockNext());

            expect(res._json.stack).toBeNull();
        });

        it('should include stack trace in development', () => {
            process.env.NODE_ENV = 'development';
            const err = new Error('Development Error');
            err.stack = 'stack_trace_here';
            const req = mockReq();
            const res = mockRes();

            errorHandler(err, req, res, mockNext());

            expect(res._json.stack).toBe('stack_trace_here');
        });
    });
});
