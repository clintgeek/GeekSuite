import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { authenticateJWTOrAPIKey, requirePermission } from '../middleware/apiKeyAuth.js';
import aiService from '../services/aiService.js';
import aiDirectorService from '../services/aiDirectorService.js';
import aiUsageService from '../services/aiUsageService.js';
import conversationService from '../services/conversationService.js';
import { countTextTokens, countMessageTokens } from '../services/tokenCounter.js';
import AIConfig from '../models/AIConfig.js';
import AIModel from '../models/AIModel.js';
import jwt from 'jsonwebtoken';
import { formatResponse, formatStreamChunk } from '../utils/responseFormatter.js';

const router = express.Router();

// Apply authentication to all routes (JWT or API key)
// Note: Individual routes can override with specific permission requirements
router.use(authenticateJWTOrAPIKey());

// GET /api/ai/stats - Get AI service statistics
router.get('/stats', async (req, res) => {
  try {
    // Check permission for API key users
    const permissionError = requirePermission(req, res, 'ai:stats');
    if (permissionError) return;

    const stats = aiService.getSessionStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to get AI statistics',
        code: 'AI_STATS_ERROR'
      }
    });
  }
});

// GET /api/ai/capabilities - Get current provider capabilities and limits
router.get('/capabilities', async (req, res) => {
  try {
    // Check permission for API key users
    const permissionError = requirePermission(req, res, 'ai:stats');
    if (permissionError) return;

    const currentProvider = aiService.currentProvider;
    const config = aiService.providers[currentProvider];
    const rateLimits = aiService.rateLimits[currentProvider];
    
    if (!config) {
      return res.status(500).json({
        success: false,
        error: {
          message: 'Current provider configuration not found',
          code: 'PROVIDER_CONFIG_ERROR'
        }
      });
    }

    // Calculate safe limits (60% of max to prevent hitting rate limits)
    const maxContextTokens = config.maxContextTokens || 32000;
    const recommendedContextTokens = Math.floor(maxContextTokens * 0.6);

    res.json({
      success: true,
      data: {
        currentProvider: currentProvider,
        maxContextTokens: maxContextTokens,
        recommendedContextTokens: recommendedContextTokens,
        maxResponseTokens: config.maxTokens || 4000,
        availableProviders: Object.keys(aiService.providers).filter(p => aiService.providers[p].enabled),
        rateLimitStatus: rateLimits ? {
          tokensUsed: rateLimits.tokensUsed || 0,
          tokensPerMinute: rateLimits.tokensPerMinute || null,
          tokensAvailable: rateLimits.tokensPerMinute ? (rateLimits.tokensPerMinute - (rateLimits.tokensUsed || 0)) : null,
          requestsUsed: rateLimits.requestsUsed || 0,
          requestsPerMinute: rateLimits.requestsPerMinute || 30,
          requestsAvailable: rateLimits.requestsPerMinute - (rateLimits.requestsUsed || 0),
          isRateLimited: rateLimits.rateLimitedUntil ? Date.now() < rateLimits.rateLimitedUntil : false,
          rateLimitedUntil: rateLimits.rateLimitedUntil || null
        } : null
      }
    });
  } catch (error) {
    console.error('Error in /api/ai/capabilities:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to get AI capabilities',
        code: 'CAPABILITIES_ERROR'
      }
    });
  }
});

// ============================================================================
// Incremental Conversation API (Phase 3 - Stateful Conversations)
// ============================================================================

/**
 * POST /api/ai/conversation/message
 * Add message(s) to a conversation and get AI response
 * 
 * This is the NEW recommended API that uses stateful conversations.
 * Only sends new messages, baseGeek manages full context.
 */
router.post('/conversation/message', async (req, res) => {
  console.log('--- /api/ai/conversation/message invoked (Phase 3) ---');
  
  try {
    const permissionError = requirePermission(req, res, 'ai:call');
    if (permissionError) return;

    const { 
      conversationId, 
      messages: newMessages,
      systemPrompt,
      stream = false,
      autoSummarize = true,
      contextWindow,
      provider,
      model,
      appName = 'unknown'
    } = req.body;
    const userId = req.user.id;

    // Validate input
    if (!conversationId) {
      return res.status(400).json({
        success: false,
        error: { message: 'conversationId is required', code: 'MISSING_CONVERSATION_ID' }
      });
    }

    if (!Array.isArray(newMessages) || newMessages.length === 0) {
      return res.status(400).json({
        success: false,
        error: { message: 'messages array is required', code: 'MISSING_MESSAGES' }
      });
    }

    // Add messages to conversation
    const addResult = await conversationService.addMessages(
      conversationId, 
      userId, 
      newMessages,
      { systemPrompt, contextWindow, provider, model, appName, autoSummarize }
    );

    console.log(`[Phase3] Conversation ${conversationId}: ${addResult.messageCount} messages, ${addResult.currentTokens} tokens`);

    // Get full context for API call
    const { systemPrompt: fullSystemPrompt, messages: allMessages, metadata } = 
      await conversationService.getMessagesForAPI(conversationId, userId);

    // Call AI with full context
    const routingOptions = {
      conversationId,
      taskTypeHint: metadata?.taskTypeHint,
      userId,
      appName,
    };

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      try {
        const smartResult = await aiService.callAISmart(allMessages, routingOptions);

        if (!smartResult.success) {
          throw new Error(smartResult.error || 'AI routing failed');
        }

        const result = formatResponse(smartResult.content);

        const promptTokens = countMessageTokens(allMessages);
        const completionTokens = countTextTokens(result);
        
        // Save assistant response to conversation (save the formatted version)
        await conversationService.addMessages(
          conversationId,
          userId,
          [{ role: 'assistant', content: result }],
          { autoSummarize }
        );

        const updatedStats = await conversationService.getConversationStats(conversationId, userId);

        const timestamp = Math.floor(Date.now() / 1000);
        const id = `chatcmpl-${Date.now()}`;
        const usedModel = smartResult.routing?.provider || aiService.currentProvider;

        // Stream response
        const chunkSize = 50;
        for (let i = 0; i < result.length; i += chunkSize) {
          const content = result.slice(i, i + chunkSize);
          res.write(`data: ${JSON.stringify({
            id,
            object: 'chat.completion.chunk',
            created: timestamp,
            model: usedModel,
            choices: [{ index: 0, delta: { content }, finish_reason: null }],
            conversation: {
              conversationId,
              currentTokens: updatedStats?.currentTokens ?? metadata.currentTokens,
              messageCount: updatedStats?.messageCount ?? metadata.messageCount
            },
            usage: {
              prompt_tokens: promptTokens,
              completion_tokens: Math.min(completionTokens, countTextTokens(content)),
              total_tokens: promptTokens + Math.min(completionTokens, countTextTokens(content))
            }
          })}\n\n`);
        }

        // Final chunk
        res.write(`data: ${JSON.stringify({
          id,
          object: 'chat.completion.chunk',
          created: timestamp,
          model: usedModel,
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
          conversation: updatedStats,
          usage: {
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: promptTokens + completionTokens
          },
          routing: smartResult.routing
        })}\n\n`);
        
        res.write('data: [DONE]\n\n');
        res.end();
      } catch (streamError) {
        console.error('[Phase3] Streaming error:', streamError);
        res.write(`data: ${JSON.stringify({ error: { message: streamError.message }})}\n\n`);
        res.end();
      }
    } else {
      // Non-streaming
      const smartResult = await aiService.callAISmart(allMessages, routingOptions);

      if (!smartResult.success) {
        throw new Error(smartResult.error || 'AI routing failed');
      }

      const result = formatResponse(smartResult.content);
      
      // Save assistant response (save the formatted version)
      await conversationService.addMessages(
        conversationId,
        userId,
        [{ role: 'assistant', content: result }],
        { autoSummarize }
      );

      const stats = await conversationService.getConversationStats(conversationId, userId);

      res.json({
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: smartResult.routing?.provider || aiService.currentProvider,
        choices: [{
          index: 0,
          message: { role: 'assistant', content: result },
          finish_reason: 'stop'
        }],
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens
        },
        conversation: stats,
        routing: smartResult.routing
      });
    }
  } catch (error) {
    console.error('[Phase3] Error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: { message: error.message, code: 'CONVERSATION_ERROR' }
      });
    }
  }
});

/**
 * GET /api/ai/conversation/:conversationId
 * Get conversation details and statistics
 */
router.get('/conversation/:conversationId', async (req, res) => {
  try {
    const permissionError = requirePermission(req, res, 'ai:stats');
    if (permissionError) return;

    const { conversationId } = req.params;
    const userId = req.user.id;

    const stats = await conversationService.getConversationStats(conversationId, userId);
    
    if (!stats) {
      return res.status(404).json({
        success: false,
        error: { message: 'Conversation not found', code: 'NOT_FOUND' }
      });
    }

    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('[Phase3] Get conversation error:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message, code: 'GET_CONVERSATION_ERROR' }
    });
  }
});

/**
 * GET /api/ai/conversations
 * List user's active conversations
 */
router.get('/conversations', async (req, res) => {
  try {
    const permissionError = requirePermission(req, res, 'ai:stats');
    if (permissionError) return;

    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 50;

    const conversations = await conversationService.listConversations(userId, { limit });
    
    res.json({ 
      success: true, 
      data: conversations,
      count: conversations.length
    });
  } catch (error) {
    console.error('[Phase3] List conversations error:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message, code: 'LIST_CONVERSATIONS_ERROR' }
    });
  }
});

/**
 * DELETE /api/ai/conversation/:conversationId
 * Delete a conversation
 */
router.delete('/conversation/:conversationId', async (req, res) => {
  try {
    const permissionError = requirePermission(req, res, 'ai:call');
    if (permissionError) return;

    const { conversationId } = req.params;
    const userId = req.user.id;

    const result = await conversationService.deleteConversation(conversationId, userId);
    
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[Phase3] Delete conversation error:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message, code: 'DELETE_CONVERSATION_ERROR' }
    });
  }
});

/**
 * POST /api/ai/conversation/:conversationId/archive
 * Archive a conversation
 */
router.post('/conversation/:conversationId/archive', async (req, res) => {
  try {
    const permissionError = requirePermission(req, res, 'ai:call');
    if (permissionError) return;

    const { conversationId } = req.params;
    const userId = req.user.id;

    const result = await conversationService.archiveConversation(conversationId, userId);
    
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[Phase3] Archive conversation error:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message, code: 'ARCHIVE_CONVERSATION_ERROR' }
    });
  }
});

// ============================================================================
// Legacy API (DEPRECATED - Use /api/ai/conversation/message instead)
// ============================================================================
// 
// This endpoint is kept for compatibility with external tools, but is NOT recommended.
// For CodeGeek (single-user), use the Phase 3 conversation API above.
//
// Why deprecated:
// - Sends full context every time (inefficient)
// - No conversation state management
// - No automatic summarization
// - Higher token usage
//
// Will be removed in future version.
// ============================================================================

// POST /api/ai/call - Generic AI call endpoint with streaming support
router.post('/call', async (req, res) => {
  // Debug logging for incoming request
  console.log('--- /api/ai/call invoked (DEPRECATED) ---');
  console.log('Method:', req.method);
  console.log('Path:', req.originalUrl);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Body (truncated):', JSON.stringify({...req.body, messages: req.body.messages ? `[${req.body.messages.length} messages]` : undefined}, null, 2));
  console.log('Stream requested:', req.body.stream);

  try {
    // Check permission for API key users
    const permissionError = requirePermission(req, res, 'ai:call');
    if (permissionError) return;

    const stream = req.body.stream || false;
    const userId = req.user.id;

    // Support both legacy 'prompt' and OpenAI-style 'messages' array
    let messages = req.body.messages;
    let prompt = req.body.prompt;
    let config = req.body.config || {};

    // If messages provided, use them directly (don't convert to string yet)
    if (Array.isArray(messages) && messages.length > 0) {
      config = { ...config, messages: messages };
    } else if (!prompt) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Prompt or messages are required',
          code: 'MISSING_PROMPT_OR_MESSAGES'
        }
      });
    }

    // Handle streaming response
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      try {
        const result = await aiService.callAI(prompt, config);
        console.log('AI result received, length:', result?.length || 0);
        console.log('AI result type:', typeof result);
        console.log('AI result FULL:', result);

        const timestamp = Math.floor(Date.now() / 1000);
        const id = `chatcmpl-${Date.now()}`;
        const model = config.model || aiService.currentProvider;

        // Stream the response in chunks (simulate streaming for better UX)
        const chunkSize = 50; // characters per chunk
        for (let i = 0; i < result.length; i += chunkSize) {
          const content = result.slice(i, i + chunkSize);
          const chunk = {
            id,
            object: 'chat.completion.chunk',
            created: timestamp,
            model,
            choices: [{
              index: 0,
              delta: { content },
              finish_reason: null
            }]
          };
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }

        // Send final chunk with finish_reason
        const finalChunk = {
          id,
          object: 'chat.completion.chunk',
          created: timestamp,
          model,
          choices: [{
            index: 0,
            delta: {},
            finish_reason: 'stop'
          }]
        };
        res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      } catch (streamError) {
        console.error('Error in streaming response:', streamError);
        const errorChunk = {
          error: {
            message: streamError.message,
            type: 'server_error',
            code: 'ai_call_failed'
          }
        };
        res.write(`data: ${JSON.stringify(errorChunk)}\n\n`);
        res.end();
      }
    } else {
      // Non-streaming response (OpenAI-compatible format)
      const result = await aiService.callAI(prompt, config);
      const model = config.model || aiService.currentProvider;

      console.log('Sending non-streaming response, length:', result?.length);

      res.json({
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: model,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: result
            },
            finish_reason: 'stop'
          }
        ],
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0
        }
      });
    }

  } catch (error) {
    console.error('Error in /api/ai/call:', error);
    if (!res.headersSent) {
      res.status(400).json({ error: error.message || 'AI call failed' });
    }
  }
});

// POST /api/ai/parse-json - AI call with JSON parsing
router.post('/parse-json', async (req, res) => {
  try {
    const { prompt, config = {} } = req.body;
    const userId = req.user.id;

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Prompt is required',
          code: 'MISSING_PROMPT'
        }
      });
    }

    const response = await aiService.callAI(prompt, config);
    const parsedResult = aiService.parseJSONResponse(response);

    res.json({
      success: true,
      data: {
        response: parsedResult,
        rawResponse: response,
        provider: aiService.currentProvider
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: 'AI JSON parsing failed',
        code: 'AI_JSON_ERROR',
        details: error.message
      }
    });
  }
});

// GET /api/ai/providers - Get available AI providers
router.get('/providers', async (req, res) => {
  try {
    const availableProviders = aiService.getAvailableProviders();
    const providerInfo = availableProviders.map(provider => ({
      name: provider,
      displayName: aiService.providers[provider].name,
      costPer1kTokens: aiService.providers[provider].costPer1kTokens
    }));

    res.json({
      success: true,
      data: {
        providers: providerInfo,
        currentProvider: aiService.currentProvider
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to get provider information',
        code: 'PROVIDER_INFO_ERROR'
      }
    });
  }
});

// POST /api/ai/provider - Set AI provider
router.post('/provider', async (req, res) => {
  try {
    const { provider } = req.body;

    if (!provider) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Provider is required',
          code: 'MISSING_PROVIDER'
        }
      });
    }

    const success = aiService.setProvider(provider);

    if (!success) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid provider',
          code: 'INVALID_PROVIDER'
        }
      });
    }

    res.json({
      success: true,
      data: {
        provider: aiService.currentProvider,
        message: `Provider set to ${aiService.providers[provider].name}`
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to set provider',
        code: 'SET_PROVIDER_ERROR'
      }
    });
  }
});

// GET /api/ai/models/:provider - Get available models for a provider
router.get('/models/:provider', async (req, res) => {
  try {
    const { provider } = req.params;

    if (!provider) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Provider is required',
          code: 'MISSING_PROVIDER'
        }
      });
    }

    // Get models from database
    const models = await aiService.getModels(provider);

    res.json({
      success: true,
      data: {
        provider,
        models
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch models',
        code: 'MODELS_FETCH_ERROR',
        details: error.message
      }
    });
  }
});

// POST /api/ai/models/:provider/refresh - Refresh models for a provider
router.post('/models/:provider/refresh', async (req, res) => {
  try {
    const { provider } = req.params;

    if (!provider) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Provider is required',
          code: 'MISSING_PROVIDER'
        }
      });
    }

    // Check if API key is configured
    const providerConfig = aiService.providers[provider];
    if (!providerConfig || !providerConfig.apiKey) {
      return res.status(400).json({
        success: false,
        error: {
          message: `${provider} API key is not configured`,
          code: 'API_KEY_NOT_CONFIGURED'
        }
      });
    }

    console.log(`Refreshing models for ${provider}...`);

    // Refresh models from provider API
    const models = await aiService.refreshModels(provider);

    console.log(`Successfully refreshed ${models.length} models for ${provider}`);

    res.json({
      success: true,
      data: {
        provider,
        models,
        message: `Models refreshed successfully for ${provider}`
      }
    });

  } catch (error) {
    console.error(`Error refreshing models for ${req.params.provider}:`, error);
    res.status(500).json({
      success: false,
      error: {
        message: `Failed to refresh ${req.params.provider} models: ${error.message}`,
        code: 'MODELS_REFRESH_ERROR',
        details: error.message
      }
    });
  }
});

// GET /api/ai/director/models - Get comprehensive model information
router.get('/director/models', async (req, res) => {
  try {
    // Check permission for API key users
    const permissionError = requirePermission(req, res, 'ai:director');
    if (permissionError) return;

    console.log('AI Director models endpoint called');
    const result = await aiDirectorService.collectModelInformation();

    console.log('AI Director result success:', result.success);
    console.log('AI Director result data keys:', result.data ? Object.keys(result.data) : 'No data');

    if (result.success) {
      res.json({
        success: true,
        data: result.data
      });
    } else {
      console.error('AI Director failed:', result.error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to collect model information',
          code: 'DIRECTOR_MODELS_ERROR',
          details: result.error?.details || 'Unknown error'
        }
      });
    }
  } catch (error) {
    console.error('AI Director models endpoint error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to collect model information',
        code: 'DIRECTOR_MODELS_ERROR',
        details: error.message
      }
    });
  }
});

// POST /api/ai/director/analyze-cost - Analyze cost for a specific prompt
router.post('/director/analyze-cost', async (req, res) => {
  try {
    const { prompt, expectedResponseLength = 1000 } = req.body;

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Prompt is required',
          code: 'MISSING_PROMPT'
        }
      });
    }

    const result = await aiDirectorService.getCostAnalysis(prompt, expectedResponseLength);

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to analyze cost',
        code: 'DIRECTOR_COST_ANALYSIS_ERROR',
        details: error.message
      }
    });
  }
});

// POST /api/ai/director/recommend - Get provider recommendations
router.post('/director/recommend', async (req, res) => {
  try {
    const { task, budget, priority = 'cost', requirements = {} } = req.body;

    if (!task) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Task description is required',
          code: 'MISSING_TASK'
        }
      });
    }

    const result = await aiDirectorService.recommendProvider(task, budget, priority, requirements);

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to get recommendations',
        code: 'DIRECTOR_RECOMMEND_ERROR',
        details: error.message
      }
    });
  }
});

// POST /api/ai/director/seed-pricing - Seed initial pricing data
router.post('/director/seed-pricing', async (req, res) => {
  try {
    await aiDirectorService.seedInitialPricing();

    res.json({
      success: true,
      data: {
        message: 'Initial pricing data seeded successfully'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to seed pricing data',
        code: 'SEED_PRICING_ERROR',
        details: error.message
      }
    });
  }
});

// POST /api/ai/director/seed-free-tier - Seed free tier information
router.post('/director/seed-free-tier', async (req, res) => {
  try {
    await aiDirectorService.seedFreeTierInformation();

    res.json({
      success: true,
      data: {
        message: 'Free tier information seeded successfully'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to seed free tier data',
        code: 'SEED_FREE_TIER_ERROR',
        details: error.message
      }
    });
  }
});

// POST /api/ai/director/force-refresh - Force refresh all providers
router.post('/director/force-refresh', async (req, res) => {
  try {
    const providers = ['anthropic', 'groq', 'gemini', 'together'];
    const results = {};

    for (const provider of providers) {
      try {
        const hasApiKey = !!aiService.providers[provider]?.apiKey;
        const isEnabled = aiService.providers[provider]?.enabled || false;

        if (hasApiKey && isEnabled) {
          console.log(`Force refreshing ${provider}...`);
          await aiService.refreshModels(provider);
          results[provider] = 'success';
        } else {
          results[provider] = 'skipped (no API key or disabled)';
        }
      } catch (error) {
        console.error(`Failed to force refresh ${provider}:`, error);
        results[provider] = `error: ${error.message}`;
      }
    }

    res.json({
      success: true,
      data: {
        message: 'Force refresh completed',
        results
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to force refresh',
        code: 'FORCE_REFRESH_ERROR',
        details: error.message
      }
    });
  }
});

// GET /api/ai/usage/:provider/:modelId - Get usage status for a specific model
router.get('/usage/:provider/:modelId', async (req, res) => {
  try {
    const { provider, modelId } = req.params;
    const userId = req.user.id;

    const usageStatus = await aiUsageService.getUsageStatus(provider, modelId, userId);

    if (usageStatus.success) {
      res.json({
        success: true,
        data: usageStatus.usage
      });
    } else {
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to get usage status',
          code: 'USAGE_STATUS_ERROR',
          details: usageStatus.error
        }
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to get usage status',
        code: 'USAGE_STATUS_ERROR',
        details: error.message
      }
    });
  }
});

// GET /api/ai/usage/:provider - Get usage summary for a provider
router.get('/usage/:provider', async (req, res) => {
  try {
    const { provider } = req.params;
    const userId = req.query.userId || req.user.id; // Allow session-level tracking

    const usageSummary = await aiUsageService.getProviderUsageSummary(provider, userId);

    if (usageSummary.success) {
      res.json({
        success: true,
        data: usageSummary.summary
      });
    } else {
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to get usage summary',
          code: 'USAGE_SUMMARY_ERROR',
          details: usageSummary.error
        }
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to get usage summary',
        code: 'USAGE_SUMMARY_ERROR',
        details: error.message
      }
    });
  }
});

// POST /api/ai/reset-stats - Reset AI statistics
router.post('/reset-stats', async (req, res) => {
  try {
    aiService.resetSessionStats();

    res.json({
      success: true,
      data: {
        message: 'AI statistics reset successfully'
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to reset statistics',
        code: 'RESET_STATS_ERROR'
      }
    });
  }
});

// GET /api/ai/config - Get AI configuration
router.get('/config', async (req, res) => {
  try {
    const configs = await AIConfig.find({});
    const config = {
      anthropic: { apiKey: '', enabled: false },
      groq: { apiKey: '', enabled: false },
      gemini: { apiKey: '', enabled: false },
      together: { apiKey: '', enabled: false },
      cohere: { apiKey: '', enabled: false },
      openrouter: { apiKey: '', enabled: false },
      cerebras: { apiKey: '', enabled: false },
      cloudflare: { apiKey: '', accountId: '', enabled: false },
      ollama: { apiKey: '', enabled: false },
      llm7: { apiKey: '', enabled: false },
      llmgateway: { apiKey: '', enabled: false },
      onemin: { apiKey: '', enabled: false }
    };

    // Load configurations from database
    for (const dbConfig of configs) {
      if (config[dbConfig.provider]) {
        config[dbConfig.provider].apiKey = dbConfig.apiKey;
        config[dbConfig.provider].enabled = dbConfig.enabled;

        // Handle Cloudflare-specific fields
        if (dbConfig.provider === 'cloudflare' && dbConfig.accountId) {
          config[dbConfig.provider].accountId = dbConfig.accountId;
        }
      }
    }

    res.json(config);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to get AI configuration',
        code: 'CONFIG_GET_ERROR'
      }
    });
  }
});

// POST /api/ai/config - Update AI configuration
router.post('/config', async (req, res) => {
  try {
    const { anthropic, groq, gemini, together, cohere, openrouter, cerebras, cloudflare, ollama, llm7, llmgateway, onemin } = req.body;

    // Update configurations in database
    const configs = [
      { provider: 'anthropic', ...anthropic },
      { provider: 'groq', ...groq },
      { provider: 'gemini', ...gemini },
      { provider: 'together', ...together },
      { provider: 'cohere', ...cohere },
      { provider: 'openrouter', ...openrouter },
      { provider: 'cerebras', ...cerebras },
      { provider: 'cloudflare', ...cloudflare },
      { provider: 'ollama', ...ollama },
      { provider: 'llm7', ...llm7 },
      { provider: 'llmgateway', ...llmgateway },
      { provider: 'onemin', ...onemin }
    ].filter(config => config.apiKey !== undefined); // Only process providers that were sent

    for (const config of configs) {
      if (config.apiKey && config.apiKey !== '***') {
        const updateData = {
          apiKey: config.apiKey.trim(), // Remove whitespace
          enabled: config.enabled || false
        };

        // Handle Cloudflare-specific fields
        if (config.provider === 'cloudflare' && config.accountId) {
          updateData.accountId = config.accountId.trim();
        }

        await AIConfig.findOneAndUpdate(
          { provider: config.provider },
          updateData,
          { upsert: true, new: true }
        );
      }
    }

    // Reload AI service configuration
    await aiService.loadConfigurations();

    res.json({
      success: true,
      data: {
        message: 'AI configuration updated successfully'
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to update AI configuration',
        code: 'CONFIG_UPDATE_ERROR'
      }
    });
  }
});

// POST /api/ai/test - Test AI provider API key
router.post('/test', async (req, res) => {
  try {
    const { provider, appName = 'test' } = req.body;
    console.log(`[AI Test] Testing provider: ${provider}`);

    if (!provider) {
      console.log('[AI Test] ❌ No provider specified');
      return res.status(400).json({
        success: false,
        error: {
          message: 'Provider is required',
          code: 'MISSING_PROVIDER'
        }
      });
    }

    // Check if API key is configured
    const providerConfig = aiService.providers[provider];
    if (!providerConfig) {
      console.log(`[AI Test] ❌ Provider '${provider}' not found in configuration`);
      return res.status(400).json({
        success: false,
        error: {
          message: `Provider '${provider}' is not supported`,
          code: 'UNKNOWN_PROVIDER'
        }
      });
    }

    if (!providerConfig.apiKey) {
      console.log(`[AI Test] ❌ ${provider} API key is not configured`);
      return res.status(400).json({
        success: false,
        error: {
          message: `${provider} API key is not configured`,
          code: 'API_KEY_NOT_CONFIGURED'
        }
      });
    }

    const maskedKey = providerConfig.apiKey.substring(0, 8) + '...' + providerConfig.apiKey.substring(providerConfig.apiKey.length - 4);
    console.log(`[AI Test] ✓ ${provider} API key found: ${maskedKey}`);
    console.log(`[AI Test] Making test API call to ${provider}...`);

    // Test the provider with a simple prompt
    const testPrompt = 'Hello, this is a test message. Please respond with "OK" if you receive this.';
    const result = await aiService.callProvider(provider, testPrompt, { maxTokens: 10, appName });

    console.log(`[AI Test] ✓ ${provider} API call successful`);
    console.log(`[AI Test] Response content: ${result.content?.substring(0, 50)}...`);

    if (result && result.content && result.content.toLowerCase().includes('ok')) {
      console.log(`[AI Test] ✅ ${provider} API key is VALID`);
      res.json({
        success: true,
        data: {
          message: `${provider} API key is valid`,
          response: result.content,
          appName
        }
      });
    } else {
      console.log(`[AI Test] ⚠️ ${provider} responded but didn't include "OK"`);
      res.json({
        success: true,
        data: {
          message: `${provider} API key is valid (response received)`,
          response: result.content,
          appName
        }
      });
    }

  } catch (error) {
    console.error(`[AI Test] ❌ Test failed:`, error.message);
    console.error(`[AI Test] Error details:`, error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to test API key',
        code: 'API_KEY_TEST_ERROR',
        details: error.message
      }
    });
  }
});

// OpenAI-compatible endpoint for CodeGeek and other clients
// POST /api/ai/v1/chat/completions - OpenAI-compatible chat completions
router.post('/v1/chat/completions', async (req, res) => {
  try {
    // Check permission for API key users
    const permissionError = requirePermission(req, res, 'ai:call');
    if (permissionError) return;

    const { model, messages, temperature, max_tokens, stream = false } = req.body;
    const userId = req.user?.id || 'api-user';

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({
        error: {
          message: 'messages is required and must be an array',
          type: 'invalid_request_error',
          code: 'missing_messages'
        }
      });
    }

    // Parse model string: supports "provider:model" or just "model"
    let provider, modelName;
    if (model && model.includes(':')) {
      [provider, modelName] = model.split(':', 2);
    } else {
      // Use default provider and specified model, or fall back to service defaults
      provider = aiService.currentProvider;
      modelName = model || aiService.providers[provider]?.model;
    }

    // Convert OpenAI message format to our internal format
    const prompt = messages.map(msg => {
      if (typeof msg.content === 'string') {
        return `${msg.role}: ${msg.content}`;
      }
      return `${msg.role}: ${JSON.stringify(msg.content)}`;
    }).join('\n\n');

    // Call AI service with specified provider and model
    const config = {
      provider,
      model: modelName,
      maxTokens: max_tokens,
      temperature,
      userId,
      appName: 'codegeek' // Track CodeGeek usage separately
    };

    const result = await aiService.callAI(prompt, config);

    // Return OpenAI-compatible response
    res.json({
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: `${provider}:${modelName}`,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: result.content || result // Handle both formats
          },
          finish_reason: 'stop'
        }
      ],
      usage: {
        prompt_tokens: result.inputTokens || 0,
        completion_tokens: result.outputTokens || 0,
        total_tokens: (result.inputTokens || 0) + (result.outputTokens || 0)
      }
    });

  } catch (error) {
    console.error('OpenAI-compatible endpoint error:', error);
    res.status(500).json({
      error: {
        message: error.message || 'AI call failed',
        type: 'server_error',
        code: 'ai_call_error'
      }
    });
  }
});

// GET /api/ai/v1/models - OpenAI-compatible models list
router.get('/v1/models', async (req, res) => {
  try {
    const providers = ['groq', 'together', 'gemini', 'anthropic'];
    const allModels = [];

    for (const provider of providers) {
      const models = await aiService.getModels(provider);
      models.forEach(model => {
        allModels.push({
          id: `${provider}:${model.id}`,
          object: 'model',
          created: Math.floor(Date.now() / 1000),
          owned_by: provider,
          provider: provider,
          modelId: model.id
        });
      });
    }

    res.json({
      object: 'list',
      data: allModels
    });

  } catch (error) {
    res.status(500).json({
      error: {
        message: 'Failed to list models',
        type: 'server_error',
        code: 'models_list_error'
      }
    });
  }
});

// ============================================================================
// Phase 2A: Smart Routing Endpoints
// ============================================================================

/**
 * POST /api/ai/call-smart
 * Smart AI call with Phase 2A family-based routing
 */
router.post('/call-smart', async (req, res) => {
  console.log('--- /api/ai/call-smart invoked (Phase 2A) ---');

  try {
    // Check permission for API key users
    const permissionError = requirePermission(req, res, 'ai:call');
    if (permissionError) return;

    const { messages, conversationId, taskTypeHint, dryRun } = req.body;
    const userId = req.user.id;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Messages array is required',
          code: 'MISSING_MESSAGES'
        }
      });
    }

    // Call smart routing
    const result = await aiService.callAISmart(messages, {
      conversationId: conversationId || `user-${userId}-${Date.now()}`,
      taskTypeHint,
      dryRun,
      userId,
      appName: req.body.appName || 'smart-routing'
    });

    res.json(result);

  } catch (error) {
    console.error('[API] Smart routing error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: error.message || 'Smart routing failed',
        code: 'SMART_ROUTING_ERROR'
      }
    });
  }
});

/**
 * GET /api/ai/families
 * Get available model families and task routing configuration
 */
router.get('/families', async (req, res) => {
  try {
    // Check permission for API key users
    const permissionError = requirePermission(req, res, 'ai:stats');
    if (permissionError) return;

    const ModelFamilyRouter = (await import('../services/aiRouterService.js')).default;
    const router = new ModelFamilyRouter();
    const stats = await router.getRoutingStats();

    res.json({
      success: true,
      families: stats.families,
      taskRouting: stats.taskRouting,
      config: stats.config
    });

  } catch (error) {
    console.error('[API] Families error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: error.message || 'Failed to get families',
        code: 'FAMILIES_ERROR'
      }
    });
  }
});

/**
 * GET /api/ai/provider-health
 * Get provider health status and scores
 */
router.get('/provider-health', async (req, res) => {
  try {
    // Check permission for API key users
    const permissionError = requirePermission(req, res, 'ai:stats');
    if (permissionError) return;

    const LoadBalancer = (await import('../services/aiBalancerService.js')).default;
    const loadBalancer = new LoadBalancer();
    const scores = await loadBalancer.getAllProviderScores();

    // Get availability for each provider
    const healthStatus = {};
    for (const provider of Object.keys(scores)) {
      const isAvailable = await loadBalancer.isProviderAvailable(provider);
      healthStatus[provider] = {
        ...scores[provider],
        available: isAvailable,
        status: isAvailable ? 'healthy' : 'on-cooldown'
      };
    }

    res.json({
      success: true,
      providers: healthStatus,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('[API] Provider health error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: error.message || 'Failed to get provider health',
        code: 'PROVIDER_HEALTH_ERROR'
      }
    });
  }
});

/**
 * POST /api/ai/context/reset/:conversationId
 * Reset cached context for a conversation
 */
router.post('/context/reset/:conversationId', async (req, res) => {
  try {
    // Check permission for API key users
    const permissionError = requirePermission(req, res, 'ai:call');
    if (permissionError) return;

    const { conversationId } = req.params;
    const { family } = req.body;

    if (!conversationId) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Conversation ID is required',
          code: 'MISSING_CONVERSATION_ID'
        }
      });
    }

    // For now, just return success (context cache will be implemented in Phase 2A½)
    res.json({
      success: true,
      message: 'Context reset queued (Phase 2A½ feature)',
      conversationId,
      family: family || 'all'
    });

  } catch (error) {
    console.error('[API] Context reset error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: error.message || 'Failed to reset context',
        code: 'CONTEXT_RESET_ERROR'
      }
    });
  }
});

// GET /api/ai/stats - Get comprehensive service statistics
router.get('/stats', async (req, res) => {
  try {
    const stats = aiService.getServiceStats();
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('[API] Stats error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: error.message || 'Failed to get stats',
        code: 'STATS_ERROR'
      }
    });
  }
});

// POST /api/ai/cache/clear - Clear response cache
router.post('/cache/clear', async (req, res) => {
  try {
    aiService.clearCache();
    res.json({
      success: true,
      message: 'Cache cleared successfully'
    });
  } catch (error) {
    console.error('[API] Cache clear error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: error.message || 'Failed to clear cache',
        code: 'CACHE_CLEAR_ERROR'
      }
    });
  }
});

// POST /api/ai/summarization - Configure summarization
router.post('/summarization', async (req, res) => {
  try {
    const { enabled, threshold } = req.body;

    if (enabled !== undefined) {
      aiService.setSummarizationEnabled(enabled);
    }

    if (threshold !== undefined) {
      aiService.setSummarizationThreshold(threshold);
    }

    res.json({
      success: true,
      config: {
        enabled: aiService.summarizationEnabled,
        threshold: aiService.summarizationThreshold
      }
    });
  } catch (error) {
    console.error('[API] Summarization config error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: error.message || 'Failed to configure summarization',
        code: 'SUMMARIZATION_CONFIG_ERROR'
      }
    });
  }
});



export default router;


