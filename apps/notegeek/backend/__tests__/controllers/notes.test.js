import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// --- Mock the Note model BEFORE importing the controller ---
const mockNoteModel = {
    create: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    countDocuments: jest.fn(),
    distinct: jest.fn(),
};

jest.unstable_mockModule('../../models/Note.js', () => ({
    default: mockNoteModel,
}));

// Mock bcrypt for lock password hashing
const mockBcrypt = {
    genSalt: jest.fn(),
    hash: jest.fn(),
};
jest.unstable_mockModule('bcryptjs', () => ({
    default: mockBcrypt,
}));

// Dynamic import AFTER mocking
const { createNote, getNotes, getNoteById, updateNote, deleteNote, getTagHierarchy } =
    await import('../../controllers/notes.js');

import { mockRequest, mockResponse, resetMocks, cleanupMocks } from '../utils/testUtils.js';

// --- Helper: valid ObjectId (24-char hex) ---
const VALID_ID = 'aabbccddeeff00112233aabb';
const INVALID_ID = 'not-a-valid-id';
const MOCK_USER_ID = 'ffeeddccbbaa99887766ffee';

describe('Notes Controller', () => {
    beforeEach(() => {
        resetMocks();
        jest.clearAllMocks();
    });

    afterEach(() => {
        cleanupMocks();
    });

    // =========================================================================
    // createNote
    // =========================================================================
    describe('createNote', () => {
        it('should create a note with valid data', async () => {
            const req = mockRequest({ content: 'Test content' }, MOCK_USER_ID);
            const res = mockResponse();
            const mockNote = { _id: VALID_ID, content: 'Test content' };
            mockNoteModel.create.mockResolvedValueOnce(mockNote);

            await createNote(req, res);

            expect(mockNoteModel.create).toHaveBeenCalledWith(expect.objectContaining({ content: 'Test content', userId: MOCK_USER_ID }));
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(mockNote);
        });

        it('should return 400 if content is missing', async () => {
            const req = mockRequest({}, MOCK_USER_ID);
            const res = mockResponse();

            await createNote(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ message: 'Note content cannot be empty' });
        });

        it('should return 400 if tags is not an array', async () => {
            const req = mockRequest({ content: 'Test content', tags: 'invalid' }, MOCK_USER_ID);
            const res = mockResponse();

            await createNote(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ message: 'Tags must be an array' });
        });

        it('should return 400 if type is invalid', async () => {
            const req = mockRequest({ content: 'Test content', type: 'invalid_type' }, MOCK_USER_ID);
            const res = mockResponse();

            await createNote(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Invalid note type') }));
        });

        it('should return 400 if locked without a password', async () => {
            const req = mockRequest({ content: 'Test content', isLocked: true }, MOCK_USER_ID);
            const res = mockResponse();

            await createNote(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ message: 'A password of at least 4 characters is required to lock the note' });
        });

        it('should return 400 if lock password is too short', async () => {
            const req = mockRequest({ content: 'Test content', isLocked: true, lockPassword: '123' }, MOCK_USER_ID);
            const res = mockResponse();

            await createNote(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ message: 'A password of at least 4 characters is required to lock the note' });
        });

        it('should hash the lock password when locking', async () => {
            const req = mockRequest({ content: 'Test content', isLocked: true, lockPassword: 'password' }, MOCK_USER_ID);
            const res = mockResponse();
            mockBcrypt.genSalt.mockResolvedValueOnce('salt');
            mockBcrypt.hash.mockResolvedValueOnce('hashed_password');
            mockNoteModel.create.mockResolvedValueOnce({ _id: VALID_ID });

            await createNote(req, res);

            expect(mockBcrypt.genSalt).toHaveBeenCalledWith(10);
            expect(mockBcrypt.hash).toHaveBeenCalledWith('password', 'salt');
            expect(mockNoteModel.create).toHaveBeenCalledWith(expect.objectContaining({ lockHash: 'hashed_password' }));
            expect(res.status).toHaveBeenCalledWith(201);
        });

        it('should return 500 if bcrypt hashing fails', async () => {
            const req = mockRequest({ content: 'Test content', isLocked: true, lockPassword: 'password' }, MOCK_USER_ID);
            const res = mockResponse();
            mockBcrypt.genSalt.mockRejectedValueOnce(new Error('Bcrypt error'));

            await createNote(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ message: 'Server error handling lock password' });
        });

        it('should return 400 on mongoose ValidationError', async () => {
            const req = mockRequest({ content: 'Test content' }, MOCK_USER_ID);
            const res = mockResponse();
            const validationError = new Error('Validation failed');
            validationError.name = 'ValidationError';
            validationError.errors = { field: 'error detailed' };
            mockNoteModel.create.mockRejectedValueOnce(validationError);

            await createNote(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Validation Error', errors: validationError.errors }));
        });

        it('should return 500 on unexpected DB error', async () => {
            const req = mockRequest({ content: 'Test content' }, MOCK_USER_ID);
            const res = mockResponse();
            mockNoteModel.create.mockRejectedValueOnce(new Error('DB Error'));

            await createNote(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ message: 'Server error creating note' });
        });

        it('should default title to "Untitled Note" if not provided', async () => {
            const req = mockRequest({ content: 'Test content' }, MOCK_USER_ID);
            const res = mockResponse();
            mockNoteModel.create.mockResolvedValueOnce({ _id: VALID_ID });

            await createNote(req, res);

            expect(mockNoteModel.create).toHaveBeenCalledWith(expect.objectContaining({ title: 'Untitled Note' }));
        });
    });

    // =========================================================================
    // getNotes
    // =========================================================================
    describe('getNotes', () => {
        it('should return paginated notes for the user', async () => {
            const req = mockRequest({}, MOCK_USER_ID);
            req.query = { page: '1', limit: '10' };
            const res = mockResponse();

            const mockChain = {
                select: jest.fn().mockReturnThis(),
                sort: jest.fn().mockReturnThis(),
                skip: jest.fn().mockReturnThis(),
                limit: jest.fn().mockReturnThis(),
                lean: jest.fn().mockResolvedValueOnce([{ _id: VALID_ID, content: 'Test content' }]),
            };
            mockNoteModel.find.mockReturnValueOnce(mockChain);
            mockNoteModel.countDocuments.mockResolvedValueOnce(1);

            await getNotes(req, res);

            expect(mockNoteModel.find).toHaveBeenCalledWith({ userId: MOCK_USER_ID });
            expect(mockChain.skip).toHaveBeenCalledWith(0);
            expect(mockChain.limit).toHaveBeenCalledWith(10);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                notes: [{ _id: VALID_ID, snippet: 'Test content' }],
                pagination: { page: 1, limit: 10, total: 1, pages: 1 },
            });
        });

        it('should filter by exact tag match', async () => {
            const req = mockRequest({}, MOCK_USER_ID);
            req.query = { tag: 'test-tag' };
            const res = mockResponse();

            const mockChain = { select: jest.fn().mockReturnThis(), sort: jest.fn().mockReturnThis(), skip: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValueOnce([]) };
            mockNoteModel.find.mockReturnValueOnce(mockChain);
            mockNoteModel.countDocuments.mockResolvedValueOnce(0);

            await getNotes(req, res);

            expect(mockNoteModel.find).toHaveBeenCalledWith({ userId: MOCK_USER_ID, tags: { $in: ['test-tag'] } });
        });

        it('should filter by tag prefix', async () => {
            const req = mockRequest({}, MOCK_USER_ID);
            req.query = { prefix: 'test-pre' };
            const res = mockResponse();

            const mockChain = { select: jest.fn().mockReturnThis(), sort: jest.fn().mockReturnThis(), skip: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValueOnce([]) };
            mockNoteModel.find.mockReturnValueOnce(mockChain);
            mockNoteModel.countDocuments.mockResolvedValueOnce(0);

            await getNotes(req, res);

            expect(mockNoteModel.find).toHaveBeenCalledWith({ userId: MOCK_USER_ID, tags: { $regex: '^test\\-pre' } });
        });

        it('should strip HTML and create snippets from content', async () => {
            const req = mockRequest({}, MOCK_USER_ID);
            req.query = {};
            const res = mockResponse();

            const mockChain = { select: jest.fn().mockReturnThis(), sort: jest.fn().mockReturnThis(), skip: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValueOnce([{ _id: VALID_ID, content: '<p><b>Hello</b> world!</p>' }]) };
            mockNoteModel.find.mockReturnValueOnce(mockChain);
            mockNoteModel.countDocuments.mockResolvedValueOnce(1);

            await getNotes(req, res);

            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                notes: [{ _id: VALID_ID, snippet: 'Hello world!' }]
            }));
        });

        it('should not create snippets for locked notes', async () => {
            const req = mockRequest({}, MOCK_USER_ID);
            req.query = {};
            const res = mockResponse();

            const mockChain = { select: jest.fn().mockReturnThis(), sort: jest.fn().mockReturnThis(), skip: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValueOnce([{ _id: VALID_ID, content: 'Secret', isLocked: true }]) };
            mockNoteModel.find.mockReturnValueOnce(mockChain);
            mockNoteModel.countDocuments.mockResolvedValueOnce(1);

            await getNotes(req, res);

            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                notes: [{ _id: VALID_ID, isLocked: true, snippet: '' }]
            }));
        });

        it('should not create snippets for handwritten or mindmap notes', async () => {
            const req = mockRequest({}, MOCK_USER_ID);
            req.query = {};
            const res = mockResponse();

            const mockChain = { select: jest.fn().mockReturnThis(), sort: jest.fn().mockReturnThis(), skip: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValueOnce([{ _id: VALID_ID, content: 'Data', type: 'handwritten' }]) };
            mockNoteModel.find.mockReturnValueOnce(mockChain);
            mockNoteModel.countDocuments.mockResolvedValueOnce(1);

            await getNotes(req, res);

            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                notes: [{ _id: VALID_ID, type: 'handwritten', snippet: '' }]
            }));
        });

        it('should clump pagination params to valid ranges', async () => {
            const req = mockRequest({}, MOCK_USER_ID);
            req.query = { page: '0', limit: '999' };
            const res = mockResponse();

            const mockChain = { select: jest.fn().mockReturnThis(), sort: jest.fn().mockReturnThis(), skip: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValueOnce([]) };
            mockNoteModel.find.mockReturnValueOnce(mockChain);
            mockNoteModel.countDocuments.mockResolvedValueOnce(0);

            await getNotes(req, res);

            expect(mockChain.skip).toHaveBeenCalledWith(0);
            expect(mockChain.limit).toHaveBeenCalledWith(100);
        });

        it('should return 500 on DB error', async () => {
            const req = mockRequest({}, MOCK_USER_ID);
            req.query = {};
            const res = mockResponse();
            mockNoteModel.find.mockImplementationOnce(() => { throw new Error('DB Error'); });

            await getNotes(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ message: 'Server error fetching notes' });
        });
    });

    // =========================================================================
    // getNoteById
    // =========================================================================
    describe('getNoteById', () => {
        it('should return a note by ID', async () => {
            const req = mockRequest({}, MOCK_USER_ID, { id: VALID_ID });
            const res = mockResponse();
            const mockNote = { _id: VALID_ID, content: 'Test' };
            mockNoteModel.findOne.mockResolvedValueOnce(mockNote);

            await getNoteById(req, res);

            expect(mockNoteModel.findOne).toHaveBeenCalledWith({ _id: VALID_ID, userId: MOCK_USER_ID });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(mockNote);
        });

        it('should return 400 for invalid ID format', async () => {
            const req = mockRequest({}, MOCK_USER_ID, { id: INVALID_ID });
            const res = mockResponse();

            await getNoteById(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ message: 'Invalid Note ID format' });
        });

        it('should return 404 if note not found', async () => {
            const req = mockRequest({}, MOCK_USER_ID, { id: VALID_ID });
            const res = mockResponse();
            mockNoteModel.findOne.mockResolvedValueOnce(null);

            await getNoteById(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({ message: 'Note not found or does not belong to user' });
        });

        it('should return limited fields for locked notes', async () => {
            const req = mockRequest({}, MOCK_USER_ID, { id: VALID_ID });
            const res = mockResponse();
            const mockLockedNote = { _id: VALID_ID, isLocked: true, content: 'Secret', title: 'Test', userId: MOCK_USER_ID, tags: [] };
            mockNoteModel.findOne.mockResolvedValueOnce(mockLockedNote);

            await getNoteById(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ isLocked: true, message: 'Note is locked. Content not available without unlock.' }));
            expect(res.json).not.toHaveBeenCalledWith(expect.objectContaining({ content: 'Secret' }));
        });

        it('should return 500 on DB error', async () => {
            const req = mockRequest({}, MOCK_USER_ID, { id: VALID_ID });
            const res = mockResponse();
            mockNoteModel.findOne.mockRejectedValueOnce(new Error('DB Error'));

            await getNoteById(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ message: 'Server error fetching note' });
        });
    });

    // =========================================================================
    // updateNote
    // =========================================================================
    describe('updateNote', () => {
        it('should update a note successfully', async () => {
            const req = mockRequest({ title: 'New Title' }, MOCK_USER_ID, { id: VALID_ID });
            const res = mockResponse();
            const mockNote = { _id: VALID_ID, title: 'Old', save: jest.fn().mockResolvedValue({ _id: VALID_ID, title: 'New Title' }) };
            mockNoteModel.findOne.mockResolvedValueOnce(mockNote);

            await updateNote(req, res);

            expect(mockNote.title).toBe('New Title');
            expect(mockNote.save).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({ _id: VALID_ID, title: 'New Title' });
        });

        it('should return 400 for invalid ID format', async () => {
            const req = mockRequest({}, MOCK_USER_ID, { id: INVALID_ID });
            const res = mockResponse();

            await updateNote(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('should return 400 for invalid note type', async () => {
            const req = mockRequest({ type: 'invalid' }, MOCK_USER_ID, { id: VALID_ID });
            const res = mockResponse();

            await updateNote(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('should return 404 if note not found', async () => {
            const req = mockRequest({ title: 'New Title' }, MOCK_USER_ID, { id: VALID_ID });
            const res = mockResponse();
            mockNoteModel.findOne.mockResolvedValueOnce(null);

            await updateNote(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
        });

        it('should return 403 if note is locked', async () => {
            const req = mockRequest({ title: 'New Title' }, MOCK_USER_ID, { id: VALID_ID });
            const res = mockResponse();
            mockNoteModel.findOne.mockResolvedValueOnce({ isLocked: true });

            await updateNote(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith({ message: 'Cannot update a locked note. Please unlock first.' });
        });

        it('should return 403 if note is encrypted', async () => {
            const req = mockRequest({ title: 'New Title' }, MOCK_USER_ID, { id: VALID_ID });
            const res = mockResponse();
            mockNoteModel.findOne.mockResolvedValueOnce({ isEncrypted: true });

            await updateNote(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
        });

        it('should only update provided fields', async () => {
            const req = mockRequest({ title: 'New Title' }, MOCK_USER_ID, { id: VALID_ID });
            const res = mockResponse();
            const mockNote = { _id: VALID_ID, title: 'Old', content: 'Old Content', save: jest.fn().mockResolvedValue({}) };
            mockNoteModel.findOne.mockResolvedValueOnce(mockNote);

            await updateNote(req, res);

            expect(mockNote.title).toBe('New Title');
            expect(mockNote.content).toBe('Old Content');
        });

        it('should return 400 on ValidationError', async () => {
            const req = mockRequest({ title: 'New Title' }, MOCK_USER_ID, { id: VALID_ID });
            const res = mockResponse();
            const validationError = new Error('Validation failed');
            validationError.name = 'ValidationError';
            const mockNote = { save: jest.fn().mockRejectedValueOnce(validationError) };
            mockNoteModel.findOne.mockResolvedValueOnce(mockNote);

            await updateNote(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('should return 500 on DB error', async () => {
            const req = mockRequest({ title: 'New Title' }, MOCK_USER_ID, { id: VALID_ID });
            const res = mockResponse();
            mockNoteModel.findOne.mockRejectedValueOnce(new Error('DB Error'));

            await updateNote(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
        });
    });

    // =========================================================================
    // deleteNote
    // =========================================================================
    describe('deleteNote', () => {
        it('should delete a note successfully', async () => {
            const req = mockRequest({}, MOCK_USER_ID, { id: VALID_ID });
            const res = mockResponse();
            const mockNote = { deleteOne: jest.fn().mockResolvedValueOnce({}) };
            mockNoteModel.findOne.mockResolvedValueOnce(mockNote);

            await deleteNote(req, res);

            expect(mockNote.deleteOne).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({ message: 'Note deleted successfully' });
        });

        it('should return 400 for invalid ID format', async () => {
            const req = mockRequest({}, MOCK_USER_ID, { id: INVALID_ID });
            const res = mockResponse();

            await deleteNote(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('should return 404 if note not found', async () => {
            const req = mockRequest({}, MOCK_USER_ID, { id: VALID_ID });
            const res = mockResponse();
            mockNoteModel.findOne.mockResolvedValueOnce(null);

            await deleteNote(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
        });

        it('should return 403 if note is locked', async () => {
            const req = mockRequest({}, MOCK_USER_ID, { id: VALID_ID });
            const res = mockResponse();
            mockNoteModel.findOne.mockResolvedValueOnce({ isLocked: true });

            await deleteNote(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
        });

        it('should return 403 if note is encrypted', async () => {
            const req = mockRequest({}, MOCK_USER_ID, { id: VALID_ID });
            const res = mockResponse();
            mockNoteModel.findOne.mockResolvedValueOnce({ isEncrypted: true });

            await deleteNote(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
        });

        it('should return 500 on DB error', async () => {
            const req = mockRequest({}, MOCK_USER_ID, { id: VALID_ID });
            const res = mockResponse();
            mockNoteModel.findOne.mockRejectedValueOnce(new Error('DB Error'));

            await deleteNote(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
        });
    });

    // =========================================================================
    // getTagHierarchy
    // =========================================================================
    describe('getTagHierarchy', () => {
        it('should build a tag hierarchy from flat tags', async () => {
            const req = mockRequest({}, MOCK_USER_ID);
            const res = mockResponse();
            const mockNotes = [
                { tags: ['work', 'work/project1'] },
                { tags: ['personal/finance'] }
            ];
            mockNoteModel.find.mockResolvedValueOnce(mockNotes);

            await getTagHierarchy(req, res);

            expect(mockNoteModel.find).toHaveBeenCalledWith({ userId: MOCK_USER_ID }, 'tags');
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                work: {
                    count: 2,
                    children: {
                        project1: { count: 1, children: null }
                    }
                },
                personal: {
                    count: 1,
                    children: {
                        finance: { count: 1, children: null }
                    }
                }
            });
        });

        it('should handle notes with no tags', async () => {
            const req = mockRequest({}, MOCK_USER_ID);
            const res = mockResponse();
            mockNoteModel.find.mockResolvedValueOnce([{ tags: [] }, { tags: [] }]);

            await getTagHierarchy(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({});
        });

        it('should increment counts for duplicate tag prefixes', async () => {
            const req = mockRequest({}, MOCK_USER_ID);
            const res = mockResponse();
            const mockNotes = [
                { tags: ['work/project1'] },
                { tags: ['work/project2'] }
            ];
            mockNoteModel.find.mockResolvedValueOnce(mockNotes);

            await getTagHierarchy(req, res);

            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                work: expect.objectContaining({ count: 2 })
            }));
        });

        it('should return 500 on DB error', async () => {
            const req = mockRequest({}, MOCK_USER_ID);
            const res = mockResponse();
            mockNoteModel.find.mockRejectedValueOnce(new Error('DB Error'));

            await getTagHierarchy(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
        });
    });
});
