import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Note from '../../models/Note.js';

let mongoServer;

// Increase timeout for all tests
jest.setTimeout(30000);

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    });
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

afterEach(async () => {
    // Clear all collections after each test
    const collections = mongoose.connection.collections;
    for (const key in collections) {
        await collections[key].deleteMany();
    }
});

describe('Note Model Validation', () => {
    const validUserId = new mongoose.Types.ObjectId();

    test('creates a valid note with required fields', async () => {
        const validNote = {
            userId: validUserId,
            content: 'Test note content',
            title: 'Test Note'
        };

        const note = await Note.create(validNote);
        expect(note.content).toBe(validNote.content);
        expect(note.userId).toEqual(validUserId);
        expect(note.title).toBe(validNote.title);
        expect(note.tags).toEqual([]); // Default empty tags array
        expect(note.isLocked).toBe(false); // Default not locked
        expect(note.isEncrypted).toBe(false); // Default not encrypted
    });

    test('fails without required content', async () => {
        const noteWithoutContent = {
            userId: validUserId,
            title: 'Test Note'
        };

        await expect(Note.create(noteWithoutContent))
            .rejects
            .toThrow('Note content cannot be empty');
    });

    test('fails without required userId', async () => {
        const noteWithoutUserId = {
            content: 'Test content',
            title: 'Test Note'
        };

        await expect(Note.create(noteWithoutUserId))
            .rejects
            .toThrow('Note validation failed');
    });

    test('validates tag format - alphanumeric with underscore, hyphen, and forward slash', async () => {
        const noteWithValidTags = {
            userId: validUserId,
            content: 'Test content',
            tags: ['valid-tag', 'another_tag', 'nested/tag', 'CamelCase']
        };

        const note = await Note.create(noteWithValidTags);
        expect(note.tags).toEqual(expect.arrayContaining(noteWithValidTags.tags));
    });

    test('rejects invalid tag characters', async () => {
        const noteWithInvalidTags = {
            userId: validUserId,
            content: 'Test content',
            tags: ['invalid tag!', 'no@symbols', 'no.dots']
        };

        await expect(Note.create(noteWithInvalidTags))
            .rejects
            .toThrow('Tags must be unique, non-empty, and contain only letters, numbers, underscores, hyphens, and forward slashes');
    });

    test('rejects empty tags', async () => {
        const noteWithEmptyTag = {
            userId: validUserId,
            content: 'Test content',
            tags: ['valid-tag', '']
        };

        await expect(Note.create(noteWithEmptyTag))
            .rejects
            .toThrow('Tags must be unique, non-empty, and contain only letters, numbers, underscores, hyphens, and forward slashes');
    });

    test('prevents duplicate tags', async () => {
        const noteWithDuplicateTags = {
            userId: validUserId,
            content: 'Test content',
            tags: ['same-tag', 'same-tag']
        };

        await expect(Note.create(noteWithDuplicateTags))
            .rejects
            .toThrow('Tags must be unique, non-empty, and contain only letters, numbers, underscores, hyphens, and forward slashes');
    });

    test('handles lock state and hash', async () => {
        const lockedNote = {
            userId: validUserId,
            content: 'Secret content',
            isLocked: true,
            lockHash: 'hashedpassword123'
        };

        const note = await Note.create(lockedNote);
        expect(note.isLocked).toBe(true);
        expect(note.lockHash).toBe(lockedNote.lockHash);
    });

    test('generates tag hierarchy from flat tags', async () => {
        const note = await Note.create({
            userId: validUserId,
            content: 'Test content',
            tags: ['parent/child/grandchild', 'parent/child2', 'other']
        });

        const hierarchy = note.tagHierarchy;
        expect(hierarchy).toEqual({
            parent: {
                child: {
                    grandchild: null
                },
                child2: null
            },
            other: null
        });
    });
});