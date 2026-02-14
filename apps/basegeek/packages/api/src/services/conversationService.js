import Conversation from '../models/Conversation.js';
import aiService from './aiService.js';
import { countMessageTokens, extractTextContent, countTextTokens } from './tokenCounter.js';

/**
 * ConversationService
 * 
 * Manages stateful conversations with intelligent context management.
 * Handles incremental message updates, automatic summarization, and
 * sliding window management to prevent context overflow.
 */

class ConversationService {
  constructor() {
    this.initialized = false;
    
    // Configuration
    this.config = {
      // When to trigger automatic summarization (percentage of context window)
      summarizationThreshold: 0.7, // 70%
      // How much context to preserve after summarization
      targetContextAfterSummary: 0.4, // 40%
      // Minimum messages to keep unsummarized
      minMessagesToKeep: 4,
      // Default context window
      defaultContextWindow: 32000,
      // TTL for conversation state (days)
      conversationTTLDays: 7
    };

    // Start cleanup job (runs every hour)
    this.startCleanupJob();
  }

  /**
   * Initialize the service
   */
  async initialize() {
    if (this.initialized) return;
    
    console.log('[ConversationService] Initializing...');
    
    try {
      // Test database connection
      const count = await Conversation.countDocuments();
      console.log(`[ConversationService] Found ${count} existing conversations`);
      
      this.initialized = true;
      console.log('[ConversationService] ✅ Initialized');
    } catch (error) {
      console.error('[ConversationService] ❌ Initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * Get or create a conversation
   */
  async getConversation(conversationId, userId, appName = 'unknown') {
    await this.ensureInitialized();
    
    return await Conversation.findOrCreate(conversationId, userId, appName);
  }

  /**
   * Add messages to a conversation (incremental update)
   */
  async addMessages(conversationId, userId, newMessages, options = {}) {
    await this.ensureInitialized();
    
    const conversation = await this.getConversation(conversationId, userId, options.appName);
    
    // Update system prompt if provided
    if (options.systemPrompt) {
      conversation.systemPrompt = options.systemPrompt;
    }

    // Update context window if provided
    if (options.contextWindow) {
      conversation.contextWindow = options.contextWindow;
    }

    // Update provider/model if provided
    if (options.provider) {
      conversation.targetProvider = options.provider;
    }
    if (options.model) {
      conversation.model = options.model;
    }

    // Add new messages
    for (const msg of newMessages) {
      conversation.addMessage(msg.role, msg.content, msg.metadata || {});
    }

    // Check if we need to summarize
    const needsSummary = this.shouldSummarize(conversation);
    if (needsSummary && options.autoSummarize !== false) {
      console.log(`[ConversationService] Context at ${conversation.currentContextTokens}/${conversation.contextWindow} tokens, triggering summarization`);
      await this.summarizeConversation(conversation);
    }

    await conversation.save();
    
    return {
      conversation,
      currentTokens: conversation.currentContextTokens,
      contextWindow: conversation.contextWindow,
      messageCount: conversation.messages.length,
      summarized: needsSummary
    };
  }

  /**
   * Get messages formatted for AI provider
   */
  async getMessagesForAPI(conversationId, userId) {
    await this.ensureInitialized();
    
    const conversation = await Conversation.findOne({ 
      conversationId, 
      userId,
      state: 'active' 
    });
    
    if (!conversation) {
      return {
        systemPrompt: '',
        messages: [],
        metadata: {}
      };
    }

    return {
      systemPrompt: conversation.systemPrompt,
      messages: conversation.getMessagesForAPI(),
      metadata: {
        conversationId: conversation.conversationId,
        currentTokens: conversation.currentContextTokens,
        contextWindow: conversation.contextWindow,
        messageCount: conversation.messages.length,
        summaryCount: conversation.summaries.length,
        targetProvider: conversation.targetProvider,
        model: conversation.model
      }
    };
  }

  /**
   * Check if conversation needs summarization
   */
  shouldSummarize(conversation) {
    const utilizationPercent = conversation.currentContextTokens / conversation.contextWindow;
    return utilizationPercent >= this.config.summarizationThreshold;
  }

  /**
   * Summarize old messages in a conversation
   */
  async summarizeConversation(conversation) {
    const targetTokens = Math.floor(conversation.contextWindow * this.config.targetContextAfterSummary);
    const currentTokens = conversation.currentContextTokens;
    
    if (currentTokens <= targetTokens) {
      console.log(`[ConversationService] No summarization needed (${currentTokens} <= ${targetTokens})`);
      return;
    }

    // Calculate how many messages to summarize
    // Keep the most recent messages, summarize the older ones
    const messagesToKeep = Math.max(this.config.minMessagesToKeep, 4);
    const messagesToSummarize = conversation.messages.length - messagesToKeep;
    
    if (messagesToSummarize <= 0) {
      console.log('[ConversationService] Too few messages to summarize, keeping all');
      return;
    }

    // Get the messages to summarize
    const oldMessages = conversation.messages.slice(0, messagesToSummarize);
    const originalTokens = countMessageTokens(oldMessages);
    
    // Build context for summarization
    const contextForSummary = oldMessages.map(msg => 
      `${msg.role}: ${extractTextContent(msg.content)}`
    ).join('\n\n');

    // Use AI to generate summary
    try {
      const summaryPrompt = `Summarize the following conversation history concisely while preserving key context, decisions, and important details:\n\n${contextForSummary}\n\nProvide a clear, concise summary (aim for ${Math.floor(targetTokens * 0.3)} tokens):`;
      
      const summary = await aiService.callAI(summaryPrompt, {
        maxTokens: Math.floor(targetTokens * 0.3),
        temperature: 0.3,
        // Use a fast, cheap provider for summarization
        provider: this.selectSummarizationProvider()
      });

      // Add summary to conversation
      conversation.addSummary(
        0, 
        messagesToSummarize - 1, 
        summary, 
        originalTokens,
        this.selectSummarizationProvider()
      );

      console.log(`[ConversationService] ✅ Summarized ${messagesToSummarize} messages: ${originalTokens} → ${Math.ceil(summary.length / 4)} tokens`);
      
    } catch (error) {
      console.error('[ConversationService] ❌ Summarization failed:', error.message);
      // Fall back to simple truncation
      this.truncateConversation(conversation, messagesToKeep);
    }
  }

  /**
   * Select best provider for summarization (fast + cheap)
   */
  selectSummarizationProvider() {
    // Prefer fast, free providers for summarization
    const providers = ['groq', 'together', 'gemini', 'cerebras'];
    
    for (const provider of providers) {
      if (aiService.providers[provider]?.enabled) {
        return provider;
      }
    }
    
    // Fallback to current provider
    return aiService.currentProvider;
  }

  /**
   * Simple truncation (fallback if summarization fails)
   */
  truncateConversation(conversation, messagesToKeep) {
    const messagesToRemove = conversation.messages.length - messagesToKeep;
    if (messagesToRemove > 0) {
      conversation.messages.splice(0, messagesToRemove);
      conversation.recalculateTokens();
      console.log(`[ConversationService] Truncated ${messagesToRemove} messages (fallback)`);
    }
  }

  /**
   * Get conversation statistics
   */
  async getConversationStats(conversationId, userId) {
    await this.ensureInitialized();
    
    const conversation = await Conversation.findOne({ 
      conversationId, 
      userId,
      state: 'active' 
    });
    
    if (!conversation) {
      return null;
    }

    return {
      conversationId: conversation.conversationId,
      messageCount: conversation.messages.length,
      summaryCount: conversation.summaries.length,
      currentTokens: conversation.currentContextTokens,
      contextWindow: conversation.contextWindow,
      utilization: (conversation.currentContextTokens / conversation.contextWindow * 100).toFixed(1) + '%',
      lastActivity: conversation.metadata.lastActivityAt,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt
    };
  }

  /**
   * List user's active conversations
   */
  async listConversations(userId, options = {}) {
    await this.ensureInitialized();
    
    const limit = options.limit || 50;
    const conversations = await Conversation.getActiveConversations(userId, limit);
    
    return conversations.map(conv => ({
      conversationId: conv.conversationId,
      appName: conv.appName,
      messageCount: conv.messages?.length || 0,
      currentTokens: conv.currentContextTokens,
      lastActivity: conv.metadata?.lastActivityAt,
      preview: conv.messages?.[conv.messages.length - 1]?.content?.substring(0, 100) || ''
    }));
  }

  /**
   * Archive a conversation
   */
  async archiveConversation(conversationId, userId) {
    await this.ensureInitialized();
    
    const conversation = await Conversation.findOne({ 
      conversationId, 
      userId,
      state: 'active' 
    });
    
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    conversation.archive();
    await conversation.save();
    
    return { success: true, conversationId };
  }

  /**
   * Delete a conversation
   */
  async deleteConversation(conversationId, userId) {
    await this.ensureInitialized();
    
    const result = await Conversation.updateOne(
      { conversationId, userId },
      { $set: { state: 'deleted', expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) } }
    );
    
    return { success: result.modifiedCount > 0, conversationId };
  }

  /**
   * Cleanup expired conversations (called by cron job)
   */
  async cleanupExpired() {
    await this.ensureInitialized();
    
    try {
      const deletedCount = await Conversation.cleanupExpired();
      if (deletedCount > 0) {
        console.log(`[ConversationService] 🧹 Cleaned up ${deletedCount} expired conversations`);
      }
      return deletedCount;
    } catch (error) {
      console.error('[ConversationService] Cleanup error:', error.message);
      return 0;
    }
  }

  /**
   * Start automatic cleanup job
   */
  startCleanupJob() {
    // Run cleanup every hour
    setInterval(async () => {
      try {
        await this.cleanupExpired();
      } catch (error) {
        console.error('[ConversationService] Cleanup job error:', error.message);
      }
    }, 60 * 60 * 1000); // 1 hour

    console.log('[ConversationService] Cleanup job started (runs every hour)');
  }

  /**
   * Ensure service is initialized
   */
  async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Get service statistics
   */
  async getServiceStats() {
    await this.ensureInitialized();
    
    const activeCount = await Conversation.countDocuments({ state: 'active' });
    const archivedCount = await Conversation.countDocuments({ state: 'archived' });
    const deletedCount = await Conversation.countDocuments({ state: 'deleted' });
    
    // Get token usage stats
    const stats = await Conversation.aggregate([
      { $match: { state: 'active' } },
      {
        $group: {
          _id: null,
          totalTokens: { $sum: '$currentContextTokens' },
          avgTokens: { $avg: '$currentContextTokens' },
          maxTokens: { $max: '$currentContextTokens' },
          totalMessages: { $sum: { $size: '$messages' } },
          avgMessages: { $avg: { $size: '$messages' } }
        }
      }
    ]);

    const usage = stats[0] || {};
    
    return {
      conversations: {
        active: activeCount,
        archived: archivedCount,
        deleted: deletedCount,
        total: activeCount + archivedCount + deletedCount
      },
      tokens: {
        total: usage.totalTokens || 0,
        average: Math.round(usage.avgTokens || 0),
        max: usage.maxTokens || 0
      },
      messages: {
        total: usage.totalMessages || 0,
        average: Math.round(usage.avgMessages || 0)
      },
      config: this.config
    };
  }
}

// Export singleton instance
const conversationService = new ConversationService();
export default conversationService;


