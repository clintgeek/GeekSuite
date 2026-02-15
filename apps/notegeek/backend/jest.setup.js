import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import { mockMongoose } from './__tests__/utils/testUtils.js';

// Set timeout for tests
jest.setTimeout(30000);

// Set environment variables for testing
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_EXPIRES_IN = '1h';

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Application specific logging, throwing an error, or other logic here
});

// Mock mongoose
jest.spyOn(mongoose, 'connect').mockImplementation(mockMongoose.connect);
jest.spyOn(mongoose, 'disconnect').mockImplementation(mockMongoose.disconnect);
jest.spyOn(mongoose, 'model').mockImplementation(mockMongoose.model);

// Add cleanup after all tests
afterAll(async () => {
  jest.restoreAllMocks();
});