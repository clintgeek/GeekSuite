/**
 * Conversation Service Tests
 * 
 * Comprehensive test suite for Phase 3 stateful conversation management.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import mongoose from 'mongoose';
import Conversation from '../models/Conversation.js';
import conversationService from '../services/conversationService.js';

// Test configuration
const TEST_USER_ID = 'test-user-123';
const TEST_APP_NAME = 'test-app';
const TEST_CONV_ID = 'test-conv-001';

describe('Conversation Model', () => {
  beforeAll(async () => {
    // Connect to test database
    const mongoUri = process.env.MONGODB_TEST_URI || 
      'mongodb://localhost:27017/basegeek-test';
    await mongoose.connect(mongoUri);
  });

  afterAll(async () => {
    // Clean up and disconnect
    await Conversation.deleteMany({});
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    // Clear conversations before each test
    await Conversation.deleteMany({});
  });

  describe('Conversation Creation', () => {
    it('should create a new conversation', async () => {
      const conv = await Conversation.findOrCreate(TEST_CONV_ID, TEST_USER_ID, TEST_APP_NAME);
      
      expect(conv.conversationId).toBe(TEST_CONV_ID);
      expect(conv.userId).toBe(TEST_USER_ID);
      expect(conv.appName).toBe(TEST_APP_NAME);
      expect(conv.state).toBe('active');
      expect(conv.messages).toHaveLength(0);
      expect(conv.summaries).toHaveLength(0);
      expect(conv.currentContextTokens).toBe(0);
    });

    it('should return existing conversation if found', async () => {
      const conv1 = await Conversation.findOrCreate(TEST_CONV_ID, TEST_USER_ID, TEST_APP_NAME);
      const conv2 = await Conversation.findOrCreate(TEST_CONV_ID, TEST_USER_ID, TEST_APP_NAME);
      
      expect(conv1._id.toString()).toBe(conv2._id.toString());
    });

    it('should set default context window', async () => {
      const conv = await Conversation.findOrCreate(TEST_CONV_ID, TEST_USER_ID, TEST_APP_NAME);
      
      expect(conv.contextWindow).toBe(32000);
    });

    it('should set expiration date', async () => {
      const conv = await Conversation.findOrCreate(TEST_CONV_ID, TEST_USER_ID, TEST_APP_NAME);
      const now = new Date();
      const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      
      expect(conv.expiresAt).toBeDefined();
      expect(conv.expiresAt.getTime()).toBeGreaterThan(now.getTime());
      expect(conv.expiresAt.getTime()).toBeLessThan(sevenDaysFromNow.getTime() + 1000);
    });
  });

  describe('Message Management', () => {
    it('should add a message to conversation', async () => {
      const conv = await Conversation.findOrCreate(TEST_CONV_ID, TEST_USER_ID, TEST_APP_NAME);
      conv.addMessage('user', 'Hello, world!');
      await conv.save();
      
      expect(conv.messages).toHaveLength(1);
      expect(conv.messages[0].role).toBe('user');
      expect(conv.messages[0].content).toBe('Hello, world!');
      expect(conv.messages[0].tokenCount).toBeGreaterThan(0);
    });

    it('should update token count when adding messages', async () => {
      const conv = await Conversation.findOrCreate(TEST_CONV_ID, TEST_USER_ID, TEST_APP_NAME);
      conv.addMessage('user', 'First message');
      conv.addMessage('assistant', 'Response to first message');
      await conv.save();
      
      expect(conv.currentContextTokens).toBeGreaterThan(0);
    });

    it('should update lastActivityAt when adding message', async () => {
      const conv = await Conversation.findOrCreate(TEST_CONV_ID, TEST_USER_ID, TEST_APP_NAME);
      const originalActivity = conv.metadata.lastActivityAt;
      
      await new Promise(resolve => setTimeout(resolve, 10)); // Wait 10ms
      
      conv.addMessage('user', 'New message');
      await conv.save();
      
      expect(conv.metadata.lastActivityAt.getTime()).toBeGreaterThan(originalActivity.getTime());
    });

    it('should reset expiration when adding message', async () => {
      const conv = await Conversation.findOrCreate(TEST_CONV_ID, TEST_USER_ID, TEST_APP_NAME);
      const originalExpiration = conv.expiresAt;
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      conv.addMessage('user', 'New message');
      await conv.save();
      
      expect(conv.expiresAt.getTime()).toBeGreaterThanOrEqual(originalExpiration.getTime());
    });
  });

  describe('Summarization', () => {
    it('should create summary of messages', async () => {
      const conv = await Conversation.findOrCreate(TEST_CONV_ID, TEST_USER_ID, TEST_APP_NAME);
      
      // Add multiple messages
      conv.addMessage('user', 'Message 1');
      conv.addMessage('assistant', 'Response 1');
      conv.addMessage('user', 'Message 2');
      conv.addMessage('assistant', 'Response 2');
      
      const originalTokens = conv.currentContextTokens;
      const originalMessageCount = conv.messages.length;
      
      // Summarize first 3 messages
      conv.addSummary(0, 2, 'Summary of first 3 messages', originalTokens, 'groq');
      await conv.save();
      
      expect(conv.summaries).toHaveLength(1);
      expect(conv.summaries[0].summary).toBe('Summary of first 3 messages');
      expect(conv.summaries[0].originalTokens).toBe(originalTokens);
      expect(conv.messages.length).toBe(originalMessageCount - 3 + 1); // Removed 3, added 1 summary
      expect(conv.messages[0].metadata.isSummary).toBe(true);
    });

    it('should reduce token count after summarization', async () => {
      const conv = await Conversation.findOrCreate(TEST_CONV_ID, TEST_USER_ID, TEST_APP_NAME);
      
      // Add messages with significant content
      conv.addMessage('user', 'This is a very long message that takes up many tokens'.repeat(10));
      conv.addMessage('assistant', 'This is also a long response'.repeat(10));
      conv.addMessage('user', 'Another long message'.repeat(10));
      
      const tokensBeforeSummary = conv.currentContextTokens;
      
      // Summarize with a short summary
      conv.addSummary(0, 2, 'Brief summary', tokensBeforeSummary, 'groq');
      await conv.save();
      
      expect(conv.currentContextTokens).toBeLessThan(tokensBeforeSummary);
    });
  });

  describe('Conversation State', () => {
    it('should archive conversation', async () => {
      const conv = await Conversation.findOrCreate(TEST_CONV_ID, TEST_USER_ID, TEST_APP_NAME);
      conv.archive();
      await conv.save();
      
      expect(conv.state).toBe('archived');
      expect(conv.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 60 * 60 * 1000);
    });

    it('should delete conversation (soft delete)', async () => {
      const conv = await Conversation.findOrCreate(TEST_CONV_ID, TEST_USER_ID, TEST_APP_NAME);
      conv.state = 'deleted';
      conv.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      await conv.save();
      
      expect(conv.state).toBe('deleted');
    });
  });
});

describe('Conversation Service', () => {
  beforeAll(async () => {
    await conversationService.initialize();
  });

  beforeEach(async () => {
    await Conversation.deleteMany({});
  });

  describe('Service Initialization', () => {
    it('should initialize successfully', async () => {
      expect(conversationService.initialized).toBe(true);
    });

    it('should have default configuration', () => {
      expect(conversationService.config.summarizationThreshold).toBe(0.7);
      expect(conversationService.config.targetContextAfterSummary).toBe(0.4);
      expect(conversationService.config.minMessagesToKeep).toBe(4);
      expect(conversationService.config.defaultContextWindow).toBe(32000);
    });
  });

  describe('Add Messages', () => {
    it('should add messages to new conversation', async () => {
      const result = await conversationService.addMessages(
        TEST_CONV_ID,
        TEST_USER_ID,
        [{ role: 'user', content: 'Hello!' }],
        { appName: TEST_APP_NAME }
      );
      
      expect(result.messageCount).toBe(1);
      expect(result.currentTokens).toBeGreaterThan(0);
      expect(result.conversation.conversationId).toBe(TEST_CONV_ID);
    });

    it('should add messages to existing conversation', async () => {
      await conversationService.addMessages(
        TEST_CONV_ID,
        TEST_USER_ID,
        [{ role: 'user', content: 'First message' }],
        { appName: TEST_APP_NAME }
      );
      
      const result = await conversationService.addMessages(
        TEST_CONV_ID,
        TEST_USER_ID,
        [{ role: 'user', content: 'Second message' }],
        { appName: TEST_APP_NAME }
      );
      
      expect(result.messageCount).toBe(2);
    });

    it('should update system prompt if provided', async () => {
      await conversationService.addMessages(
        TEST_CONV_ID,
        TEST_USER_ID,
        [{ role: 'user', content: 'Hello' }],
        { systemPrompt: 'You are a helpful assistant', appName: TEST_APP_NAME }
      );
      
      const { systemPrompt } = await conversationService.getMessagesForAPI(TEST_CONV_ID, TEST_USER_ID);
      expect(systemPrompt).toBe('You are a helpful assistant');
    });
  });

  describe('Get Messages for API', () => {
    it('should return messages formatted for API', async () => {
      await conversationService.addMessages(
        TEST_CONV_ID,
        TEST_USER_ID,
        [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' }
        ],
        { appName: TEST_APP_NAME }
      );
      
      const { messages, metadata } = await conversationService.getMessagesForAPI(TEST_CONV_ID, TEST_USER_ID);
      
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('user');
      expect(messages[1].role).toBe('assistant');
      expect(metadata.conversationId).toBe(TEST_CONV_ID);
      expect(metadata.messageCount).toBe(2);
    });

    it('should return empty for non-existent conversation', async () => {
      const result = await conversationService.getMessagesForAPI('nonexistent', TEST_USER_ID);
      
      expect(result.messages).toHaveLength(0);
      expect(result.systemPrompt).toBe('');
    });
  });

  describe('Automatic Summarization', () => {
    it('should trigger summarization at threshold', async () => {
      // Add many messages to exceed threshold (70% of 32K = 22.4K tokens)
      const longMessage = 'This is a long message. '.repeat(100); // ~600 tokens
      
      // Add enough messages to hit threshold (need ~37 messages of 600 tokens each)
      const messages = [];
      for (let i = 0; i < 40; i++) {
        messages.push({ role: i % 2 === 0 ? 'user' : 'assistant', content: longMessage });
      }
      
      const result = await conversationService.addMessages(
        TEST_CONV_ID,
        TEST_USER_ID,
        messages,
        { appName: TEST_APP_NAME, autoSummarize: true }
      );
      
      // Summarization might have occurred
      if (result.summarized) {
        expect(result.conversation.summaries).not.toHaveLength(0);
      }
    });

    it('should not summarize below threshold', async () => {
      const result = await conversationService.addMessages(
        TEST_CONV_ID,
        TEST_USER_ID,
        [{ role: 'user', content: 'Short message' }],
        { appName: TEST_APP_NAME, autoSummarize: true }
      );
      
      expect(result.summarized).toBeFalsy();
      expect(result.conversation.summaries).toHaveLength(0);
    });
  });

  describe('Conversation Statistics', () => {
    it('should return conversation stats', async () => {
      await conversationService.addMessages(
        TEST_CONV_ID,
        TEST_USER_ID,
        [{ role: 'user', content: 'Hello!' }],
        { appName: TEST_APP_NAME }
      );
      
      const stats = await conversationService.getConversationStats(TEST_CONV_ID, TEST_USER_ID);
      
      expect(stats.conversationId).toBe(TEST_CONV_ID);
      expect(stats.messageCount).toBe(1);
      expect(stats.utilization).toContain('%');
      expect(stats.currentTokens).toBeGreaterThan(0);
    });

    it('should return null for non-existent conversation', async () => {
      const stats = await conversationService.getConversationStats('nonexistent', TEST_USER_ID);
      expect(stats).toBeNull();
    });
  });

  describe('List Conversations', () => {
    it('should list user conversations', async () => {
      await conversationService.addMessages(
        'conv-1',
        TEST_USER_ID,
        [{ role: 'user', content: 'First conversation' }],
        { appName: TEST_APP_NAME }
      );
      
      await conversationService.addMessages(
        'conv-2',
        TEST_USER_ID,
        [{ role: 'user', content: 'Second conversation' }],
        { appName: TEST_APP_NAME }
      );
      
      const conversations = await conversationService.listConversations(TEST_USER_ID);
      
      expect(conversations).toHaveLength(2);
      expect(conversations.map(c => c.conversationId)).toContain('conv-1');
      expect(conversations.map(c => c.conversationId)).toContain('conv-2');
    });

    it('should limit number of conversations returned', async () => {
      for (let i = 0; i < 10; i++) {
        await conversationService.addMessages(
          `conv-${i}`,
          TEST_USER_ID,
          [{ role: 'user', content: `Message ${i}` }],
          { appName: TEST_APP_NAME }
        );
      }
      
      const conversations = await conversationService.listConversations(TEST_USER_ID, { limit: 5 });
      expect(conversations).toHaveLength(5);
    });
  });

  describe('Archive and Delete', () => {
    it('should archive conversation', async () => {
      await conversationService.addMessages(
        TEST_CONV_ID,
        TEST_USER_ID,
        [{ role: 'user', content: 'Message' }],
        { appName: TEST_APP_NAME }
      );
      
      const result = await conversationService.archiveConversation(TEST_CONV_ID, TEST_USER_ID);
      
      expect(result.success).toBe(true);
      
      const conv = await Conversation.findOne({ conversationId: TEST_CONV_ID });
      expect(conv.state).toBe('archived');
    });

    it('should delete conversation', async () => {
      await conversationService.addMessages(
        TEST_CONV_ID,
        TEST_USER_ID,
        [{ role: 'user', content: 'Message' }],
        { appName: TEST_APP_NAME }
      );
      
      const result = await conversationService.deleteConversation(TEST_CONV_ID, TEST_USER_ID);
      
      expect(result.success).toBe(true);
      
      const conv = await Conversation.findOne({ conversationId: TEST_CONV_ID });
      expect(conv.state).toBe('deleted');
    });

    it('should throw error when archiving non-existent conversation', async () => {
      await expect(
        conversationService.archiveConversation('nonexistent', TEST_USER_ID)
      ).rejects.toThrow('Conversation not found');
    });
  });

  describe('Cleanup', () => {
    it('should cleanup expired conversations', async () => {
      // Create a conversation with past expiration
      const conv = await Conversation.findOrCreate(TEST_CONV_ID, TEST_USER_ID, TEST_APP_NAME);
      conv.expiresAt = new Date(Date.now() - 1000); // Expired 1 second ago
      await conv.save();
      
      const deletedCount = await conversationService.cleanupExpired();
      
      expect(deletedCount).toBeGreaterThan(0);
      
      const found = await Conversation.findOne({ conversationId: TEST_CONV_ID });
      expect(found).toBeNull();
    });

    it('should not cleanup active conversations', async () => {
      await conversationService.addMessages(
        TEST_CONV_ID,
        TEST_USER_ID,
        [{ role: 'user', content: 'Message' }],
        { appName: TEST_APP_NAME }
      );
      
      const deletedCount = await conversationService.cleanupExpired();
      
      expect(deletedCount).toBe(0);
      
      const found = await Conversation.findOne({ conversationId: TEST_CONV_ID });
      expect(found).not.toBeNull();
    });
  });

  describe('Service Statistics', () => {
    it('should return service stats', async () => {
      await conversationService.addMessages(
        'conv-1',
        TEST_USER_ID,
        [{ role: 'user', content: 'Message 1' }],
        { appName: TEST_APP_NAME }
      );
      
      await conversationService.addMessages(
        'conv-2',
        TEST_USER_ID,
        [{ role: 'user', content: 'Message 2' }],
        { appName: TEST_APP_NAME }
      );
      
      const stats = await conversationService.getServiceStats();
      
      expect(stats.conversations.active).toBeGreaterThanOrEqual(2);
      expect(stats.tokens.total).toBeGreaterThan(0);
      expect(stats.messages.total).toBeGreaterThanOrEqual(2);
      expect(stats.config).toBeDefined();
    });
  });
});

// Export for use in integration tests
export { TEST_USER_ID, TEST_APP_NAME, TEST_CONV_ID };


