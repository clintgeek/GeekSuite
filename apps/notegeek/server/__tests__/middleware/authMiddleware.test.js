import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { protect } from '../../middleware/authMiddleware.js';
import {
    mockRequest,
    mockResponse,
    mockNext,
    mockJwtVerify,
    mockJwtExpiredToken,
    mockJwtInvalidToken,
    resetMocks,
    cleanupMocks,
    UserModel
} from '../utils/testUtils.js';

describe('Auth Middleware', () => {
    beforeEach(() => {
        resetMocks();
    });

    afterEach(() => {
        cleanupMocks();
    });

    it('should set req.user when valid token is provided', async () => {
        // Setup
        const userId = 'mockObjectId';
        mockJwtVerify({ id: userId });
        UserModel.findById.mockResolvedValueOnce({
            _id: userId,
            email: 'test@example.com'
        });

        const req = mockRequest({
            headers: {
                authorization: 'Bearer valid.token.here'
            }
        });
        const res = mockResponse();

        // Execute
        await protect(req, res, mockNext);

        // Assert
        expect(req.user).toBeDefined();
        expect(req.user._id).toBe(userId);
        expect(mockNext).toHaveBeenCalled();
    });

    it('should return 401 when no token is provided', async () => {
        // Setup
        const req = mockRequest();
        const res = mockResponse();

        // Execute
        await protect(req, res, mockNext);

        // Assert
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            message: expect.stringContaining('Not authorized')
        }));
        expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 when token format is invalid', async () => {
        // Setup
        const req = mockRequest({
            headers: {
                authorization: 'InvalidFormat'
            }
        });
        const res = mockResponse();

        // Execute
        await protect(req, res, mockNext);

        // Assert
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            message: expect.stringContaining('Not authorized')
        }));
        expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 when token is expired', async () => {
        // Setup
        mockJwtExpiredToken();
        const req = mockRequest({
            headers: {
                authorization: 'Bearer expired.token.here'
            }
        });
        const res = mockResponse();

        // Execute
        await protect(req, res, mockNext);

        // Assert
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            message: expect.stringContaining('Token has expired')
        }));
        expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 when token is invalid', async () => {
        // Setup
        mockJwtInvalidToken();
        const req = mockRequest({
            headers: {
                authorization: 'Bearer invalid.token.here'
            }
        });
        const res = mockResponse();

        // Execute
        await protect(req, res, mockNext);

        // Assert
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            message: expect.stringContaining('Not authorized')
        }));
        expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 when user is not found', async () => {
        // Setup
        const userId = 'nonexistentId';
        mockJwtVerify({ id: userId });
        UserModel.findById.mockResolvedValueOnce(null);

        const req = mockRequest({
            headers: {
                authorization: 'Bearer valid.token.here'
            }
        });
        const res = mockResponse();

        // Execute
        await protect(req, res, mockNext);

        // Assert
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            message: expect.stringContaining('not found')
        }));
        expect(mockNext).not.toHaveBeenCalled();
    });
});