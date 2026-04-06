import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// --- Mock the Folder and Note models BEFORE importing the controller ---
const mockFolderModel = {
    create: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    find: jest.fn(),
    deleteOne: jest.fn(),
};

const mockNoteModel = {
    deleteMany: jest.fn(),
    updateMany: jest.fn(),
};

jest.unstable_mockModule('../../models/Folder.js', () => ({
    default: mockFolderModel,
}));

jest.unstable_mockModule('../../models/Note.js', () => ({
    default: mockNoteModel,
}));

// Dynamic import AFTER mocking
const { createFolder, getFolders, updateFolder, deleteFolder } =
    await import('../../controllers/folders.js');

import { mockRequest, mockResponse, resetMocks, cleanupMocks } from '../utils/testUtils.js';

const VALID_ID = 'aabbccddeeff00112233aabb';
const INVALID_ID = 'not-valid';
const MOCK_USER_ID = 'ffeeddccbbaa99887766ffee';

describe('Folders Controller', () => {
    beforeEach(() => {
        resetMocks();
        jest.clearAllMocks();
    });

    afterEach(() => {
        cleanupMocks();
    });

    // =========================================================================
    // createFolder
    // =========================================================================
    describe('createFolder', () => {
        it('should create a folder with valid name', async () => {
            const req = mockRequest({ name: 'Work' }, MOCK_USER_ID);
            const res = mockResponse();
            mockFolderModel.findOne.mockResolvedValueOnce(null);
            mockFolderModel.create.mockResolvedValueOnce({ _id: VALID_ID, name: 'Work' });

            await createFolder(req, res);

            expect(mockFolderModel.findOne).toHaveBeenCalledWith({ userId: MOCK_USER_ID, name: 'Work' });
            expect(mockFolderModel.create).toHaveBeenCalledWith({ name: 'Work', userId: MOCK_USER_ID });
            expect(res.status).toHaveBeenCalledWith(201);
        });

        it('should return 400 if name is empty', async () => {
            const req = mockRequest({ name: '' }, MOCK_USER_ID);
            const res = mockResponse();

            await createFolder(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ message: 'Folder name cannot be empty' });
        });

        it('should return 400 if name is only whitespace', async () => {
            const req = mockRequest({ name: '   ' }, MOCK_USER_ID);
            const res = mockResponse();

            await createFolder(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('should return 400 if folder name already exists', async () => {
            const req = mockRequest({ name: 'Work' }, MOCK_USER_ID);
            const res = mockResponse();
            mockFolderModel.findOne.mockResolvedValueOnce({ _id: VALID_ID, name: 'Work' });

            await createFolder(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ message: "Folder with name 'Work' already exists" });
        });

        it('should handle duplicate key error (code 11000)', async () => {
            const req = mockRequest({ name: 'Work' }, MOCK_USER_ID);
            const res = mockResponse();
            mockFolderModel.findOne.mockResolvedValueOnce(null);
            const duplicateError = new Error('Duplicate');
            duplicateError.code = 11000;
            mockFolderModel.create.mockRejectedValueOnce(duplicateError);

            await createFolder(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ message: "Folder with name 'Work' already exists" });
        });

        it('should return 400 on ValidationError', async () => {
            const req = mockRequest({ name: 'Work' }, MOCK_USER_ID);
            const res = mockResponse();
            mockFolderModel.findOne.mockResolvedValueOnce(null);
            const validationError = new Error('ValidationError');
            validationError.name = 'ValidationError';
            mockFolderModel.create.mockRejectedValueOnce(validationError);

            await createFolder(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('should return 500 on DB error', async () => {
            const req = mockRequest({ name: 'Work' }, MOCK_USER_ID);
            const res = mockResponse();
            mockFolderModel.findOne.mockRejectedValueOnce(new Error('DB Error'));

            await createFolder(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
        });

        it('should trim the folder name', async () => {
            const req = mockRequest({ name: '  My Folder  ' }, MOCK_USER_ID);
            const res = mockResponse();
            mockFolderModel.findOne.mockResolvedValueOnce(null);

            await createFolder(req, res);

            expect(mockFolderModel.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'My Folder' }));
        });
    });

    // =========================================================================
    // getFolders
    // =========================================================================
    describe('getFolders', () => {
        it('should return folders sorted alphabetically', async () => {
            const req = mockRequest({}, MOCK_USER_ID);
            const res = mockResponse();
            const mockFolders = [{ name: 'A' }, { name: 'B' }];
            const mockSort = jest.fn().mockResolvedValueOnce(mockFolders);
            mockFolderModel.find.mockReturnValueOnce({ sort: mockSort });

            await getFolders(req, res);

            expect(mockFolderModel.find).toHaveBeenCalledWith({ userId: MOCK_USER_ID });
            expect(mockSort).toHaveBeenCalledWith({ name: 1 });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(mockFolders);
        });

        it('should return 500 on DB error', async () => {
            const req = mockRequest({}, MOCK_USER_ID);
            const res = mockResponse();
            mockFolderModel.find.mockImplementationOnce(() => { throw new Error('DB Error'); });

            await getFolders(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
        });
    });

    // =========================================================================
    // updateFolder
    // =========================================================================
    describe('updateFolder', () => {
        it('should update a folder name', async () => {
            const req = mockRequest({ name: 'Updated' }, MOCK_USER_ID, { id: VALID_ID });
            const res = mockResponse();
            mockFolderModel.findOne.mockResolvedValueOnce(null);
            mockFolderModel.findOneAndUpdate.mockResolvedValueOnce({ _id: VALID_ID, name: 'Updated' });

            await updateFolder(req, res);

            expect(mockFolderModel.findOneAndUpdate).toHaveBeenCalledWith(
                { _id: VALID_ID, userId: MOCK_USER_ID },
                { name: 'Updated' },
                { new: true, runValidators: true }
            );
            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('should return 400 for invalid ID format', async () => {
            const req = mockRequest({ name: 'Updated' }, MOCK_USER_ID, { id: INVALID_ID });
            const res = mockResponse();

            await updateFolder(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('should return 400 if name is empty', async () => {
            const req = mockRequest({ name: '' }, MOCK_USER_ID, { id: VALID_ID });
            const res = mockResponse();

            await updateFolder(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('should return 400 if another folder has the same name', async () => {
            const req = mockRequest({ name: 'Duplicate' }, MOCK_USER_ID, { id: VALID_ID });
            const res = mockResponse();
            mockFolderModel.findOne.mockResolvedValueOnce({ _id: 'other-id', name: 'Duplicate' });

            await updateFolder(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ message: "Another folder with name 'Duplicate' already exists" });
        });

        it('should return 404 if folder not found', async () => {
            const req = mockRequest({ name: 'Updated' }, MOCK_USER_ID, { id: VALID_ID });
            const res = mockResponse();
            mockFolderModel.findOne.mockResolvedValueOnce(null);
            mockFolderModel.findOneAndUpdate.mockResolvedValueOnce(null);

            await updateFolder(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
        });

        it('should handle duplicate key error (code 11000)', async () => {
            const req = mockRequest({ name: 'Updated' }, MOCK_USER_ID, { id: VALID_ID });
            const res = mockResponse();
            mockFolderModel.findOne.mockResolvedValueOnce(null);
            const duplicateError = new Error('Duplicate');
            duplicateError.code = 11000;
            mockFolderModel.findOneAndUpdate.mockRejectedValueOnce(duplicateError);

            await updateFolder(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('should return 500 on DB error', async () => {
            const req = mockRequest({ name: 'Updated' }, MOCK_USER_ID, { id: VALID_ID });
            const res = mockResponse();
            mockFolderModel.findOne.mockRejectedValueOnce(new Error('DB Error'));

            await updateFolder(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
        });
    });

    // =========================================================================
    // deleteFolder
    // =========================================================================
    describe('deleteFolder', () => {
        it('should delete folder and unassign notes by default', async () => {
            const req = mockRequest({}, MOCK_USER_ID, { id: VALID_ID });
            const res = mockResponse();
            mockFolderModel.findOne.mockResolvedValueOnce({ _id: VALID_ID });
            mockNoteModel.updateMany.mockResolvedValueOnce({ modifiedCount: 1 });
            mockFolderModel.deleteOne.mockResolvedValueOnce({});

            await deleteFolder(req, res);

            expect(mockNoteModel.updateMany).toHaveBeenCalledWith(
                { folderId: VALID_ID, userId: MOCK_USER_ID },
                { $set: { folderId: null } }
            );
            expect(mockFolderModel.deleteOne).toHaveBeenCalledWith({ _id: VALID_ID, userId: MOCK_USER_ID });
            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('should cascade delete notes when deleteNotes=true', async () => {
            const req = mockRequest({}, MOCK_USER_ID, { id: VALID_ID });
            req.query = { deleteNotes: 'true' };
            const res = mockResponse();
            mockFolderModel.findOne.mockResolvedValueOnce({ _id: VALID_ID });
            mockNoteModel.deleteMany.mockResolvedValueOnce({ deletedCount: 1 });

            await deleteFolder(req, res);

            expect(mockNoteModel.deleteMany).toHaveBeenCalledWith({ folderId: VALID_ID, userId: MOCK_USER_ID });
            expect(mockFolderModel.deleteOne).toHaveBeenCalledWith({ _id: VALID_ID, userId: MOCK_USER_ID });
            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('should return 400 for invalid ID format', async () => {
            const req = mockRequest({}, MOCK_USER_ID, { id: INVALID_ID });
            const res = mockResponse();

            await deleteFolder(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('should return 404 if folder not found', async () => {
            const req = mockRequest({}, MOCK_USER_ID, { id: VALID_ID });
            const res = mockResponse();
            mockFolderModel.findOne.mockResolvedValueOnce(null);

            await deleteFolder(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
        });

        it('should return 500 on DB error', async () => {
            const req = mockRequest({}, MOCK_USER_ID, { id: VALID_ID });
            const res = mockResponse();
            mockFolderModel.findOne.mockRejectedValueOnce(new Error('DB Error'));

            await deleteFolder(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
        });
    });
});
