import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { registerUser, loginUser } from '../../controllers/authController.js';
import {
    mockRequest,
    mockResponse,
    createTestUser,
    mockBcryptHash,
    mockBcryptCompare,
    mockJwtSign,
    resetMocks,
    cleanupMocks,
    UserModel
} from '../utils/testUtils.js';

describe('Auth Controller', () => {
    beforeEach(() => {
        resetMocks();
    });

    afterEach(() => {
        cleanupMocks();
    });

    describe('registerUser', () => {
        it('should register a new user successfully', async () => {
            // Setup
            const userData = {
                email: 'new@example.com',
                password: 'validPassword123'
            };

            mockBcryptHash('hashedPassword');
            UserModel.findOne.mockResolvedValueOnce(null);
            UserModel.create.mockResolvedValueOnce({
                _id: 'mockObjectId',
                email: userData.email,
                passwordHash: 'hashedPassword'
            });
            mockJwtSign('mock.jwt.token');

            const req = mockRequest({ body: userData });
            const res = mockResponse();

            // Execute
            await registerUser(req, res);

            // Assert
            expect(UserModel.findOne).toHaveBeenCalledWith({ email: userData.email });
            expect(UserModel.create).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                _id: expect.any(String),
                email: userData.email,
                token: expect.any(String)
            }));
        });

        it('should return 400 when email is missing', async () => {
            // Setup
            const req = mockRequest({ body: { password: 'password123' } });
            const res = mockResponse();

            // Execute
            await registerUser(req, res);

            // Assert
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                message: expect.stringContaining('required')
            }));
        });

        it('should return 400 when password is missing', async () => {
            // Setup
            const req = mockRequest({ body: { email: 'test@example.com' } });
            const res = mockResponse();

            // Execute
            await registerUser(req, res);

            // Assert
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                message: expect.stringContaining('required')
            }));
        });

        it('should return 400 when password is too short', async () => {
            // Setup
            const req = mockRequest({
                body: {
                    email: 'test@example.com',
                    password: 'short'
                }
            });
            const res = mockResponse();

            // Execute
            await registerUser(req, res);

            // Assert
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                message: expect.stringContaining('characters')
            }));
        });

        it('should return 400 when email already exists', async () => {
            // Setup
            const existingUser = await createTestUser();
            UserModel.findOne.mockResolvedValueOnce(existingUser);

            const req = mockRequest({
                body: {
                    email: existingUser.email,
                    password: 'validPassword123'
                }
            });
            const res = mockResponse();

            // Execute
            await registerUser(req, res);

            // Assert
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                message: expect.stringContaining('already exists')
            }));
        });
    });

    describe('loginUser', () => {
        it('should login user successfully with valid credentials', async () => {
            // Setup
            const user = await createTestUser();
            UserModel.findOne.mockResolvedValueOnce(user);
            mockBcryptCompare(true);
            mockJwtSign('mock.jwt.token');

            const req = mockRequest({
                body: {
                    email: user.email,
                    password: 'password123'
                }
            });
            const res = mockResponse();

            // Execute
            await loginUser(req, res);

            // Assert
            expect(UserModel.findOne).toHaveBeenCalledWith({ email: user.email });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                _id: user._id,
                email: user.email,
                token: expect.any(String)
            }));
        });

        it('should return 400 when email is missing', async () => {
            // Setup
            const req = mockRequest({ body: { password: 'password123' } });
            const res = mockResponse();

            // Execute
            await loginUser(req, res);

            // Assert
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                message: expect.stringContaining('required')
            }));
        });

        it('should return 400 when password is missing', async () => {
            // Setup
            const req = mockRequest({ body: { email: 'test@example.com' } });
            const res = mockResponse();

            // Execute
            await loginUser(req, res);

            // Assert
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                message: expect.stringContaining('required')
            }));
        });

        it('should return 401 when user is not found', async () => {
            // Setup
            UserModel.findOne.mockResolvedValueOnce(null);

            const req = mockRequest({
                body: {
                    email: 'nonexistent@example.com',
                    password: 'password123'
                }
            });
            const res = mockResponse();

            // Execute
            await loginUser(req, res);

            // Assert
            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                message: expect.stringContaining('Invalid')
            }));
        });

        it('should return 401 when password is incorrect', async () => {
            // Setup
            const user = await createTestUser();
            UserModel.findOne.mockResolvedValueOnce(user);
            mockBcryptCompare(false);

            const req = mockRequest({
                body: {
                    email: user.email,
                    password: 'wrongPassword'
                }
            });
            const res = mockResponse();

            // Execute
            await loginUser(req, res);

            // Assert
            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                message: expect.stringContaining('Invalid')
            }));
        });
    });
});