import { jest, describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../../models/User.js';

let mongoServer;

// Increase timeout for all tests (MongoMemoryServer can be slow to start)
jest.setTimeout(30000);

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    });
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

afterEach(async () => {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
        await collections[key].deleteMany();
    }
});

describe('User Model Validation', () => {
    const validUser = {
        email: 'test@example.com',
        passwordHash: 'hashed_password_at_least_6',
    };

    it('should create a valid user with email and passwordHash', async () => {
        const user = await User.create(validUser);
        expect(user.email).toBe(validUser.email);
        expect(user.passwordHash).toBe(validUser.passwordHash);
        expect(user._id).toBeDefined();
    });

    it('should fail without email', async () => {
        const invalidUser = { ...validUser };
        delete invalidUser.email;

        await expect(User.create(invalidUser)).rejects.toThrow('Please add an email');
    });

    it('should fail without passwordHash', async () => {
        const invalidUser = { ...validUser };
        delete invalidUser.passwordHash;

        await expect(User.create(invalidUser)).rejects.toThrow('Please add a password hash');
    });

    it('should fail with invalid email format', async () => {
        const invalidUser = { ...validUser, email: 'not-an-email' };

        await expect(User.create(invalidUser)).rejects.toThrow('Please include a valid email');
    });

    it('should enforce unique email', async () => {
        await User.create(validUser);

        const duplicateUser = { ...validUser, passwordHash: 'different_hash' };
        await expect(User.create(duplicateUser)).rejects.toThrowError(/E11000 duplicate key error/);
    });

    it('should lowercase the email', async () => {
        const mixedCaseUser = { ...validUser, email: 'Test@Example.COM' };
        const user = await User.create(mixedCaseUser);

        expect(user.email).toBe('test@example.com');
    });

    it('should set createdAt by default', async () => {
        const user = await User.create(validUser);
        expect(user.createdAt).toBeInstanceOf(Date);
        expect(user.updatedAt).toBeInstanceOf(Date);
    });

    it('should support optional userId field', async () => {
        const customUserId = 'ffeeddccbbaa99887766ffee';
        const user = await User.create({ ...validUser, userId: customUserId });
        expect(user.userId).toBe(customUserId);
    });
});
