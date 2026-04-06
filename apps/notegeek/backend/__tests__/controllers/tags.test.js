import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// --- Mock the Note model ---
const mockNoteModel = {
    distinct: jest.fn(),
};

jest.unstable_mockModule('../../models/Note.js', () => ({
    default: mockNoteModel,
}));

const { getTags } = await import('../../controllers/tags.js');

import { mockRequest, mockResponse, resetMocks, cleanupMocks } from '../utils/testUtils.js';

const MOCK_USER_ID = 'ffeeddccbbaa99887766ffee';

describe('Tags Controller', () => {
    beforeEach(() => {
        resetMocks();
        jest.clearAllMocks();
    });

    afterEach(() => {
        cleanupMocks();
    });

    describe('getTags', () => {
        it('should return sorted unique tags for the user', async () => {
            const req = mockRequest({}, MOCK_USER_ID);
            const res = mockResponse();
            mockNoteModel.distinct.mockResolvedValueOnce(['zebra', 'apple', 'banana']);

            await getTags(req, res);

            expect(mockNoteModel.distinct).toHaveBeenCalledWith('tags', { userId: MOCK_USER_ID });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(['apple', 'banana', 'zebra']);
        });

        it('should return empty array if user has no tags', async () => {
            const req = mockRequest({}, MOCK_USER_ID);
            const res = mockResponse();
            mockNoteModel.distinct.mockResolvedValueOnce([]);

            await getTags(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith([]);
        });

        it('should return 500 on DB error', async () => {
            const req = mockRequest({}, MOCK_USER_ID);
            const res = mockResponse();
            mockNoteModel.distinct.mockRejectedValueOnce(new Error('DB Error'));

            await getTags(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ message: 'Server error fetching tags' });
        });
    });
});
