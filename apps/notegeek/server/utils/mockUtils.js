import { jest } from '@jest/globals';
import mongoose from 'mongoose';

// Request/Response Mocks
export const mockReq = (body = {}, params = {}, query = {}, headers = {}) => ({
    body,
    params,
    query,
    headers: {
        authorization: headers.authorization || '',
        ...headers
    }
});

export const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
};

export const mockNext = jest.fn();

// Database Mocks
export const mockMongoose = () => ({
    connect: jest.fn().mockResolvedValue(true),
    connection: {
        dropDatabase: jest.fn().mockResolvedValue(true),
        close: jest.fn().mockResolvedValue(true)
    },
    Schema: jest.fn(),
    model: jest.fn(),
    Types: {
        ObjectId: jest.fn()
    }
});

// Auth Mocks
export const mockJwt = () => ({
    sign: jest.fn().mockReturnValue('mockToken'),
    verify: jest.fn().mockReturnValue({ id: new mongoose.Types.ObjectId() }),
    TokenExpiredError: class TokenExpiredError extends Error {
        constructor(message, expiredAt) {
            super(message);
            this.expiredAt = expiredAt;
        }
    }
});

// Bcrypt Mocks
export const mockBcrypt = () => ({
    genSalt: jest.fn().mockResolvedValue('mockSalt'),
    hash: jest.fn().mockResolvedValue('mockHash'),
    compare: jest.fn().mockResolvedValue(true)
});

// User Model Mock
export const mockUser = (overrides = {}) => ({
    _id: new mongoose.Types.ObjectId(),
    email: 'test@example.com',
    passwordHash: 'mockHash',
    save: jest.fn().mockResolvedValue(true),
    ...overrides
});

// Note Model Mock
export const mockNote = (overrides = {}) => ({
    _id: new mongoose.Types.ObjectId(),
    content: 'Test note content',
    userId: new mongoose.Types.ObjectId(),
    tags: ['test', 'note'],
    isLocked: false,
    save: jest.fn().mockResolvedValue(true),
    ...overrides
});

// Mock Setup Utilities
export const setupMocks = () => {
    // Mock environment variables
    process.env.JWT_SECRET = 'test-secret';
    process.env.JWT_EXPIRE = '30d';

    // Mock modules
    jest.mock('mongoose', () => mockMongoose());
    jest.mock('jsonwebtoken', () => mockJwt());
    jest.mock('bcrypt', () => mockBcrypt());
};

export const cleanupMocks = () => {
    jest.clearAllMocks();
    jest.resetAllMocks();
    jest.restoreAllMocks();
};

// Mock Error Cases
export const mockError = (errorType, message) => {
    switch (errorType) {
        case 'TokenExpiredError':
            throw new (require('jsonwebtoken').TokenExpiredError)(message, new Date());
        case 'JsonWebTokenError':
            throw new (require('jsonwebtoken').JsonWebTokenError)(message);
        case 'ValidationError':
            const error = new Error(message);
            error.name = 'ValidationError';
            throw error;
        default:
            throw new Error(message);
    }
};