import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { fileURLToPath } from 'url';

// Mock mongoose
const mockMongoose = {
    connect: jest.fn(),
};
jest.unstable_mockModule('mongoose', () => ({
    default: mockMongoose,
}));

// Mock the pino-backed logger — connectDB no longer uses console.log/error or
// process.exit itself (Phase 2 hardening pass moved fail-fast handling up to
// server.js's start(), which awaits connectDB() and exits on rejection).
// NOTE: unstable_mockModule needs an absolute path here — a relative
// specifier resolves against jest.setup.js (a jest/ESM quirk when a
// setupFilesAfterEnv file also touches the jest module registry), not
// against this test file, and silently fails to find the module.
const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
};
jest.unstable_mockModule(fileURLToPath(new URL('../../lib/logger.js', import.meta.url)), () => ({
    logger: mockLogger,
}));

const { default: connectDB } = await import('../../config/db.js');

describe('Database Configuration', () => {
    beforeEach(() => {
        process.env.DB_URI = 'mongodb://localhost:27017/test';
        jest.clearAllMocks();
    });

    afterEach(() => {
        delete process.env.DB_URI;
    });

    it('should connect to MongoDB with correct URI and options', async () => {
        const mockConnection = { connection: { host: 'localhost' } };
        mockMongoose.connect.mockResolvedValueOnce(mockConnection);

        await connectDB();

        expect(mockMongoose.connect).toHaveBeenCalledWith(
            'mongodb://localhost:27017/test',
            { authSource: 'admin' }
        );
        expect(mockLogger.info).toHaveBeenCalledWith(
            { host: 'localhost' },
            'MongoDB connected'
        );
    });

    it('should propagate connection failure to the caller (no internal process.exit)', async () => {
        const mockError = new Error('Connection failed');
        mockMongoose.connect.mockRejectedValueOnce(mockError);

        await expect(connectDB()).rejects.toThrow('Connection failed');
        expect(mockLogger.info).not.toHaveBeenCalled();
    });
});
