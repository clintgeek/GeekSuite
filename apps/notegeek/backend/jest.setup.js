import { vi } from 'vitest';
import mongoose from 'mongoose';
import { mockMongoose } from './__tests__/utils/testUtils.js';

// Set environment variables for testing
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_EXPIRES_IN = '1h';

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Application specific logging, throwing an error, or other logic here
});

// Mock mongoose
vi.spyOn(mongoose, 'connect').mockImplementation(mockMongoose.connect);
vi.spyOn(mongoose, 'disconnect').mockImplementation(mockMongoose.disconnect);
vi.spyOn(mongoose, 'model').mockImplementation(mockMongoose.model);

// Add cleanup after all tests
afterAll(async () => {
  vi.restoreAllMocks();
});