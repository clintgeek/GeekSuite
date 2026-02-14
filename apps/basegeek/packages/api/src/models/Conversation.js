import mongoose from 'mongoose';
import { getAIGeekConnection } from '../config/database.js';
import { countTextTokens, extractTextContent } from '../services/tokenCounter.js';

/**
 * Conversation Model
 * 
 * Stores conversation state for incremental message handling.
 * Each conversation maintains its message history, context summaries,
 * and metadata for intelligent context management.
 */

const messageSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ['system', 'user', 'assistant', 'tool'],
    required: true
  },
  content: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  toolCallId: String, // For tool messages
  timestamp: {
    type: Date,
    default: Date.now
  },
  // Token count for this message (cached for performance)
  tokenCount: {
    type: Number,
    default: 0
  },
  // Response ID for GPT-5 style continuity
  responseId: String,
  // Metadata for special handling
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, { _id: false });

const summarySchema = new mongoose.Schema({
  // Range of messages that were summarized
  fromMessageIndex: {
    type: Number,
    required: true
  },
  toMessageIndex: {
    type: Number,
    required: true
  },
  // Summary text
  summary: {
    type: String,
    required: true
  },
  // Original token count before summarization
  originalTokens: {
    type: Number,
    required: true
  },
  // Token count of the summary
  summaryTokens: {
    type: Number,
    required: true
  },
  // When this summary was created
  createdAt: {
    type: Date,
    default: Date.now
  },
  // Provider used for summarization
  provider: String
}, { _id: false });

const conversationSchema = new mongoose.Schema({
  // Unique conversation ID (generated client-side or server-side)
  conversationId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  // User who owns this conversation
  userId: {
    type: String,
    required: true,
    index: true
  },
  // Application that created this conversation
  appName: {
    type: String,
    default: 'unknown',
    index: true
  },
  // System prompt (stored separately, not counted in history)
  systemPrompt: {
    type: String,
    default: ''
  },
  // Message history
  messages: [messageSchema],
  // Summaries of condensed message ranges
  summaries: [summarySchema],
  // Current context window being used
  contextWindow: {
    type: Number,
    default: 32000
  },
  // Target provider (if locked to specific provider)
  targetProvider: String,
  // Model being used
  model: String,
  // Total tokens in current context (cached for performance)
  currentContextTokens: {
    type: Number,
    default: 0
  },
  // Conversation metadata
  metadata: {
    // Task type hint for smart routing
    taskTypeHint: String,
    // Custom settings
    settings: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    // Last activity timestamp
    lastActivityAt: {
      type: Date,
      default: Date.now
    }
  },
  // Conversation state
  state: {
    type: String,
    enum: ['active', 'archived', 'deleted'],
    default: 'active',
    index: true
  },
  // TTL for automatic cleanup (conversations inactive for 7 days)
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    index: true
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
conversationSchema.index({ userId: 1, state: 1, updatedAt: -1 });
conversationSchema.index({ appName: 1, state: 1, updatedAt: -1 });
conversationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
conversationSchema.index({ conversationId: 1, userId: 1 }, { unique: true });

// Methods

/**
 * Add a new message to the conversation
 */
conversationSchema.methods.addMessage = function(role, content, metadata = {}) {
  const textContent = extractTextContent(content)

  this.messages.push({
    role,
    content,
    timestamp: new Date(),
    metadata,
    tokenCount: countTextTokens(textContent)
  });
  this.metadata.lastActivityAt = new Date();
  // Reset expiration
  this.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  this.recalculateTokens();
};

/**
 * Recalculate total token count
 */
conversationSchema.methods.recalculateTokens = function() {
  this.currentContextTokens = this.messages.reduce((sum, msg) => {
    const textContent = extractTextContent(msg.content)
    const tokens = msg.tokenCount || countTextTokens(textContent)
    return sum + tokens
  }, 0);
  // Add summary tokens
  this.currentContextTokens += this.summaries.reduce((sum, s) => sum + (s.summaryTokens || 0), 0);
};

/**
 * Get messages for API call (formatted for provider)
 */
conversationSchema.methods.getMessagesForAPI = function() {
  return this.messages.map(msg => ({
    role: msg.role,
    content: msg.content,
    ...(msg.toolCallId ? { tool_call_id: msg.toolCallId } : {}),
    ...(msg.metadata ? { metadata: msg.metadata } : {})
  }));
};

/**
 * Condense old messages into a summary
 */
conversationSchema.methods.addSummary = function(fromIndex, toIndex, summaryText, originalTokens, provider) {
  const summaryTokens = countTextTokens(summaryText);
  
  this.summaries.push({
    fromMessageIndex: fromIndex,
    toMessageIndex: toIndex,
    summary: summaryText,
    originalTokens,
    summaryTokens,
    createdAt: new Date(),
    provider
  });

  // Remove the summarized messages
  this.messages.splice(fromIndex, toIndex - fromIndex + 1);
  
  // Add summary as a system message at the beginning
  this.messages.unshift({
    role: 'system',
    content: `[Previous conversation summary]: ${summaryText}`,
    timestamp: new Date(),
    tokenCount: summaryTokens,
    metadata: { isSummary: true }
  });

  this.recalculateTokens();
};

/**
 * Archive this conversation
 */
conversationSchema.methods.archive = function() {
  this.state = 'archived';
  this.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days for archived
};

// Statics

/**
 * Find or create a conversation
 */
conversationSchema.statics.findOrCreate = async function(conversationId, userId, appName = 'unknown') {
  let conversation = await this.findOne({ conversationId, userId, state: 'active' });
  
  if (!conversation) {
    conversation = new this({
      conversationId,
      userId,
      appName,
      state: 'active'
    });
    await conversation.save();
  }
  
  return conversation;
};

/**
 * Get active conversations for a user
 */
conversationSchema.statics.getActiveConversations = async function(userId, limit = 50) {
  return this.find({ userId, state: 'active' })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .select('conversationId appName currentContextTokens metadata.lastActivityAt messages')
    .lean();
};

/**
 * Cleanup expired conversations
 */
conversationSchema.statics.cleanupExpired = async function() {
  const result = await this.deleteMany({
    expiresAt: { $lt: new Date() },
    state: { $in: ['active', 'archived'] }
  });
  return result.deletedCount;
};

// Use aiGeek database connection
const aiGeekConnection = getAIGeekConnection();
const Conversation = aiGeekConnection.model('Conversation', conversationSchema);

export default Conversation;


