import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// --- Mock the Note model ---
const mockNoteModel = {
    find: jest.fn(),
};

jest.unstable_mockModule('../../models/Note.js', () => ({
    default: mockNoteModel,
}));

const { searchNotes } = await import('../../controllers/search.js');

import { mockRequest, mockResponse, resetMocks, cleanupMocks } from '../utils/testUtils.js';

const MOCK_USER_ID = 'ffeeddccbbaa99887766ffee';

describe('Search Controller', () => {
    beforeEach(() => {
        resetMocks();
        jest.clearAllMocks();
    });

    afterEach(() => {
        cleanupMocks();
    });

    describe('searchNotes', () => {
        it('should return matching notes with snippets', async () => {
            const req = mockRequest({}, MOCK_USER_ID);
            req.query = { q: 'test query' };
            const res = mockResponse();

            const mockNotes = [
                { _id: '1', title: 'Test', content: 'This is a test note.', score: 1.5, type: 'text', isLocked: false, tags: [] },
                { _id: '2', title: 'Another', content: '<p>HTML test here</p>', score: 1.0, type: 'markdown', isLocked: false, tags: [] }
            ];

            const mockChain = {
                sort: jest.fn().mockReturnThis(),
                lean: jest.fn().mockResolvedValueOnce(mockNotes),
            };
            mockNoteModel.find.mockReturnValueOnce(mockChain);

            await searchNotes(req, res);

            expect(mockNoteModel.find).toHaveBeenCalledWith(
                { userId: MOCK_USER_ID, $text: { $search: 'test query' } },
                expect.any(Object)
            );
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith([
                expect.objectContaining({ _id: '1', snippet: 'This is a test note.', score: 1.5 }),
                expect.objectContaining({ _id: '2', snippet: 'HTML test here', score: 1.0 })
            ]);
        });

        it('should return 400 if query is empty', async () => {
            const req = mockRequest({}, MOCK_USER_ID);
            req.query = { q: '' };
            const res = mockResponse();

            await searchNotes(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ message: 'Search query cannot be empty' });
        });

        it('should return 400 if query is only whitespace', async () => {
            const req = mockRequest({}, MOCK_USER_ID);
            req.query = { q: '   ' };
            const res = mockResponse();

            await searchNotes(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('should return 400 if query exceeds max length', async () => {
            const req = mockRequest({}, MOCK_USER_ID);
            req.query = { q: 'a'.repeat(501) };
            const res = mockResponse();

            await searchNotes(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('should not include content snippet for locked notes', async () => {
            const req = mockRequest({}, MOCK_USER_ID);
            req.query = { q: 'secret' };
            const res = mockResponse();

            const mockNotes = [
                { _id: '3', title: 'Top Secret', content: 'Secret info', isLocked: true, type: 'text' }
            ];

            const mockChain = {
                sort: jest.fn().mockReturnThis(),
                lean: jest.fn().mockResolvedValueOnce(mockNotes),
            };
            mockNoteModel.find.mockReturnValueOnce(mockChain);

            await searchNotes(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith([
                expect.objectContaining({ _id: '3', snippet: '', message: 'Note is locked. Content not available.' })
            ]);
            expect(res.json).not.toHaveBeenCalledWith(
                expect.arrayContaining([expect.objectContaining({ content: 'Secret info' })])
            );
        });

        it('should not include snippet for handwritten or mindmap notes', async () => {
            const req = mockRequest({}, MOCK_USER_ID);
            req.query = { q: 'drawing' };
            const res = mockResponse();

            const mockNotes = [
                { _id: '4', content: 'drawing data', type: 'handwritten' },
                { _id: '5', content: 'mindmap data', type: 'mindmap' }
            ];

            const mockChain = {
                sort: jest.fn().mockReturnThis(),
                lean: jest.fn().mockResolvedValueOnce(mockNotes),
            };
            mockNoteModel.find.mockReturnValueOnce(mockChain);

            await searchNotes(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith([
                expect.objectContaining({ _id: '4', type: 'handwritten', snippet: '' }),
                expect.objectContaining({ _id: '5', type: 'mindmap', snippet: '' })
            ]);
        });

        it('should strip HTML tags from content for snippets', async () => {
            const req = mockRequest({}, MOCK_USER_ID);
            req.query = { q: 'bold' };
            const res = mockResponse();

            const mockNotes = [
                { _id: '6', content: '<strong>Very bold</strong> text', type: 'markdown' }
            ];

            const mockChain = {
                sort: jest.fn().mockReturnThis(),
                lean: jest.fn().mockResolvedValueOnce(mockNotes),
            };
            mockNoteModel.find.mockReturnValueOnce(mockChain);

            await searchNotes(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith([
                expect.objectContaining({ _id: '6', snippet: 'Very bold text' })
            ]);
        });

        it('should return 500 on DB error', async () => {
            const req = mockRequest({}, MOCK_USER_ID);
            req.query = { q: 'error' };
            const res = mockResponse();
            mockNoteModel.find.mockImplementationOnce(() => { throw new Error('DB Error'); });

            await searchNotes(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ message: 'Server error searching notes' });
        });
    });
});
