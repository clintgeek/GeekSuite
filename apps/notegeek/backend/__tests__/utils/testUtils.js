import { vi } from 'vitest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

// Mock models that will be exported and used directly
export const UserModel = {
    findOne: vi.fn().mockResolvedValue(null),
    findById: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockImplementation(async (data) => ({ ...data, _id: 'mockObjectId' })),
    deleteMany: vi.fn().mockResolvedValue({ deletedCount: 1 })
};

export const NoteModel = {
    findOne: vi.fn().mockResolvedValue(null),
    findById: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockImplementation(async (data) => ({ ...data, _id: 'mockObjectId' })),
    deleteMany: vi.fn().mockResolvedValue({ deletedCount: 1 })
};

// Simple mock for mongoose
export const mockMongoose = {
    connect: vi.fn().mockResolvedValue(true),
    disconnect: vi.fn().mockResolvedValue(true),
    model: vi.fn((name) => {
        if (name === 'User') return UserModel;
        if (name === 'Note') return NoteModel;
        throw new Error(`Model ${ name } not mocked`);
    }),
    Types: {
        ObjectId: () => ({
            toString: () => 'mockObjectId',
            equals: (other) => other && other.toString() === 'mockObjectId'
        })
    }
};

// MongoDB Test Utilities
export const createObjectId = () => 'mockObjectId';

export const createTestUser = async (overrides = {}) => {
    const defaultUser = {
        _id: createObjectId(),
        email: 'test@example.com',
        passwordHash: await bcrypt.hash('password123', 10),
        ...overrides
    };
    return defaultUser;
};

export const createTestNote = async (userId, overrides = {}) => {
    const defaultNote = {
        _id: createObjectId(),
        content: 'Test note content',
        userId,
        tags: ['test', 'note'],
        isLocked: false,
        ...overrides
    };
    return defaultNote;
};

// JWT Test Utilities
export const mockJwtVerify = (returnValue = { id: createObjectId() }) => {
    return vi.spyOn(jwt, 'verify').mockReturnValue(returnValue);
};

export const mockJwtSign = (returnValue = 'mock.jwt.token') => {
    return vi.spyOn(jwt, 'sign').mockReturnValue(returnValue);
};

export const mockJwtExpiredToken = () => {
    return vi.spyOn(jwt, 'verify').mockImplementation(() => {
        throw new jwt.TokenExpiredError('jwt expired', new Date());
    });
};

export const mockJwtInvalidToken = () => {
    return vi.spyOn(jwt, 'verify').mockImplementation(() => {
        throw new jwt.JsonWebTokenError('invalid token');
    });
};

// Bcrypt Test Utilities
export const mockBcryptHash = (returnValue = 'hashedPassword') => {
    return vi.spyOn(bcrypt, 'hash').mockResolvedValue(returnValue);
};

export const mockBcryptCompare = (returnValue = true) => {
    return vi.spyOn(bcrypt, 'compare').mockResolvedValue(returnValue);
};

// Request/Response Test Utilities
export const mockRequest = ({
    body = {},
    params = {},
    query = {},
    headers = {},
    user = null
} = {}) => ({
    body,
    params,
    query,
    headers: {
        authorization: headers.authorization || '',
        ...headers
    },
    user
});

export const mockResponse = () => {
    const res = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    res.send = vi.fn().mockReturnValue(res);
    return res;
};

export const mockNext = vi.fn();

// Mock Database Utilities
export const setupTestDb = () => {
    // Reset all mock implementations
    UserModel.findOne.mockReset();
    UserModel.findById.mockReset();
    UserModel.create.mockReset();
    UserModel.deleteMany.mockReset();

    NoteModel.findOne.mockReset();
    NoteModel.findById.mockReset();
    NoteModel.create.mockReset();
    NoteModel.deleteMany.mockReset();

    // Setup default mock implementations
    UserModel.findOne.mockImplementation(async (query) => {
        if (query.email === 'test@example.com') {
            return await createTestUser();
        }
        return null;
    });

    UserModel.findById.mockImplementation(async (id) => {
        if (id === 'mockObjectId') {
            return await createTestUser();
        }
        return null;
    });

    UserModel.create.mockImplementation(async (data) => {
        return await createTestUser(data);
    });

    NoteModel.findOne.mockImplementation(async (query) => {
        if (query._id === 'mockObjectId') {
            return await createTestNote(query.userId);
        }
        return null;
    });

    NoteModel.findById.mockImplementation(async (id) => {
        if (id === 'mockObjectId') {
            return await createTestNote('mockObjectId');
        }
        return null;
    });

    NoteModel.create.mockImplementation(async (data) => {
        return await createTestNote(data.userId, data);
    });
};

export const clearTestDb = () => {
    UserModel.deleteMany.mockResolvedValue({ deletedCount: 1 });
    NoteModel.deleteMany.mockResolvedValue({ deletedCount: 1 });
};

// Reset function for test files to use
export const resetMocks = () => {
    vi.clearAllMocks();
    setupTestDb();
};

export const cleanupMocks = () => {
    clearTestDb();
    vi.restoreAllMocks();
};