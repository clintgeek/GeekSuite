import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock mongoose
const mockMongoose = {
    connect: jest.fn(),
};
jest.unstable_mockModule('mongoose', () => ({
    default: mockMongoose,
}));

const { default: connectDB } = await import('../../config/db.js');

describe('Database Configuration', () => {
    let mockExit;
    let originalConsoleLog;
    let originalConsoleError;

    beforeEach(() => {
        // Mock process.exit to prevent the test suite from exiting on failure
        mockExit = jest.spyOn(process, 'exit').mockImplementation(() => { });

        // Suppress console output during tests
        originalConsoleLog = console.log;
        originalConsoleError = console.error;
        console.log = jest.fn();
        console.error = jest.fn();

        process.env.DB_URI = 'mongodb://localhost:27017/test';
        jest.clearAllMocks();
    });

    afterEach(() => {
        mockExit.mockRestore();
        console.log = originalConsoleLog;
        console.error = originalConsoleError;
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
        expect(console.log).toHaveBeenCalledWith('MongoDB Connected: localhost');
        expect(mockExit).not.toHaveBeenCalled();
    });

    it('should exit process on connection failure', async () => {
        const mockError = new Error('Connection failed');
        mockMongoose.connect.mockRejectedValueOnce(mockError);

        await connectDB();

        expect(console.error).toHaveBeenCalledWith('Error connecting to MongoDB: Connection failed');
        expect(mockExit).toHaveBeenCalledWith(1);
    });
});
