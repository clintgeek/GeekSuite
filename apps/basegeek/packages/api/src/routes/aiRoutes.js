import express from 'express';
import { requireRole } from '../middleware/auth.js';
import { PROVIDER_IDS, keyHintFor } from '../config/aiProviders.js';
import { authenticateJWTOrAPIKey, requirePermission } from '../middleware/apiKeyAuth.js';
import { resolveCaller, declaresAppRouting, logCaller } from '../services/callerIdentity.js';
import { resolveFailure } from '../services/aiFailureEnvelope.js';
import logger from '../lib/logger.js';
import aiService from '../services/aiService.js';
import aiDirectorService from '../services/aiDirectorService.js';
import aiUsageService from '../services/aiUsageService.js';
import conversationService from '../services/conversationService.js';
import { countTextTokens, countMessageTokens } from '../services/tokenCounter.js';
import AIConfig from '../models/AIConfig.js';
import { encrypt } from '@geeksuite/crypto-vault';
import AIModel from '../models/AIModel.js';
import jwt from 'jsonwebtoken';
import { formatResponse, formatStreamChunk } from '../utils/responseFormatter.js';

const router = express.Router();

/**
 * FINDING F-19 — the second front door, retired 2026-09-05.
 *
 * `/api/ai/v1/chat/completions` was an older, much worse implementation of the
 * same contract `/openai/v1/chat/completions` implements. It flattened the
 * whole `messages` array into one `"role: content"` string, accepted `stream`
 * and ignored it, supported neither `tools` nor `response_format`, and used
 * `provider:model` instead of `provider/model` for pinning. It appeared in no
 * aiGeek doc, so anyone who found it concluded aiGeek was far less compatible
 * than it is — and it rotted precisely because nothing tested it. Two
 * endpoints claiming one contract is one endpoint too many.
 *
 * A 308 rather than a delete: 308 is the redirect that preserves the method
 * and the body (307/308, unlike 301/302, forbid rewriting POST to GET), so a
 * client still pointed here follows it and its completion still happens.
 * `fetch` and every HTTP client an SDK is built on follow it by default.
 *
 * Registered above `authenticateJWTOrAPIKey()` deliberately: there is nothing
 * here to protect, and a caller should learn the address has changed rather
 * than that its credentials are wrong. The real gate is on the other side.
 *
 * `/v1/models` goes with it — it was the same second surface, listing model
 * ids in a `provider:model` spelling the live endpoint does not accept.
 */
const OPENAI_SURFACE = '/openai/v1';
for (const legacyPath of ['/v1/chat/completions', '/v1/models']) {
  router.all(legacyPath, (req, res) => {
    res.redirect(308, `${OPENAI_SURFACE}${legacyPath.slice('/v1'.length)}`);
  });
}

// Apply authentication to all routes (JWT or API key)
// Note: Individual routes can override with specific permission requirements
router.use(authenticateJWTOrAPIKey());

/**
 * requireAdminUser — the admin gate for the provider-credential routes.
 *
 * The router already authenticated the caller above, so this only has to
 * settle *who* they are. API keys are refused outright: a key belongs to an
 * app, not a person, has no userGeek document to carry a role, and no app has
 * any business reading or rewriting the suite's provider credentials. Its
 * req.user.id is a synthetic `apikey_<id>` string, so letting it reach
 * requireRole's User.findById would only produce a 500 cast error anyway.
 *
 * Everyone else falls through to the shared requireRole('admin'), so the
 * denial body is the same { error: 'admin_required' } shape every other admin
 * gate in the suite emits (see adminGates.test.js).
 */
const requireAdminUser = (req, res, next) => {
  if (req.user?.type === 'api_key') {
    return res.status(403).json({
      error: 'admin_required',
      message: 'admin role required',
      code: 'ADMIN_REQUIRED'
    });
  }
  return requireRole('admin')(req, res, next);
};

/**
 * failUpstream — the REST twin of the OpenAI proxy's error envelope.
 *
 * Q46: `/call` put `error.message` into the body (and into its streaming error
 * frame) and `/parse-json` put it into `error.details`. Those strings are built
 * as `` `Anthropic API error (${status}): ${JSON.stringify(error.response.data)}` ``
 * in aiService, so an `ai:call` key holder read the vendor's name and its raw
 * error body — org and project ids, quota detail, a redacted key fragment. The
 * proxy stopped doing that in `267c4e3`; these three sites were filed and are
 * closed here, against the *same* allowlist, now shared from
 * services/aiFailureEnvelope.js.
 *
 * The old `/call` catch also chose 400 vs 502 by testing the message for
 * "required" or "Missing". Every genuine client-shaped refusal on this route
 * returns before the try block reaches a provider, and the one aiService throw
 * that says "missing" is a provider-shape failure, so the heuristic bought
 * nothing and required reading the string it must not return. The classifier
 * reads the upstream status instead.
 */
const failUpstream = (req, res, error, context = {}) => {
  const failure = resolveFailure(req, res, error, context, '[ai] upstream failure');
  return res.status(failure.status).json({
    success: false,
    error: {
      message: failure.message,
      type: failure.type,
      code: failure.code
    }
  });
};

// The providers /config reads and writes — config/aiProviders.js is the one
// list; llm7 and onemin used to be named here and had no implementation.
const CONFIG_PROVIDERS = PROVIDER_IDS;

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
    req.log.error({ err: error }, 'Error in /api/ai/capabilities');
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
  req.log.info('--- /api/ai/conversation/message invoked (Phase 3) ---');
  
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
      freeOnly = false
    } = req.body;

    // Same rule as /call: the app is the credential's, not the body's. The
    // conversation record carries it too, so a conversation cannot be filed
    // under an app its caller does not hold a credential for.
    const caller = resolveCaller(req, req.body);
    logCaller(req, caller, '[ai] /conversation/message caller');
    const appName = caller.appId;
    const userId = caller.userId || req.user.id;

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

    req.log.debug({ conversationId, messageCount: addResult.messageCount, currentTokens: addResult.currentTokens }, '[Phase3] Conversation state');

    // Get full context for API call
    const { systemPrompt: fullSystemPrompt, messages: allMessages, metadata } = 
      await conversationService.getMessagesForAPI(conversationId, userId);

    // Call AI with full context
    const routingOptions = {
      conversationId,
      taskTypeHint: metadata?.taskTypeHint,
      userId,
      appName,
      feature: caller.feature,
      freeOnly: freeOnly || provider === 'free',
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
        req.log.error({ err: streamError }, '[Phase3] Streaming error');
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
    req.log.error({ err: error }, '[Phase3] Error');
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
    req.log.error({ err: error }, '[Phase3] Get conversation error');
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
    req.log.error({ err: error }, '[Phase3] List conversations error');
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
    req.log.error({ err: error }, '[Phase3] Delete conversation error');
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
    req.log.error({ err: error }, '[Phase3] Archive conversation error');
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
  req.log.debug({
    method: req.method,
    path: req.originalUrl,
    stream: req.body.stream,
    messageCount: req.body.messages?.length,
  }, '--- /api/ai/call invoked (DEPRECATED) ---');

  try {
    // Check permission for API key users
    const permissionError = requirePermission(req, res, 'ai:call');
    if (permissionError) return;

    // Who is calling comes from the credential, never from the body. The body
    // may still name a *feature* of that app.
    const caller = resolveCaller(req, req.body);
    logCaller(req, caller, '[ai] /call caller');

    const stream = req.body.stream || false;

    // Support both legacy 'prompt' and OpenAI-style 'messages' array
    let messages = req.body.messages;
    let prompt = req.body.prompt;
    let config = req.body.config || {};

    // Support freeOnly flag — apps can request provider: "free" or freeOnly: true
    if (config.provider === 'free' || config.freeOnly || req.body.freeOnly) {
      config.freeOnly = true;
      delete config.provider;
    }

    // Support app config routing — apps can omit provider/model to use server-side config
    // Triggered when: no provider specified, or provider: "basegeek-app", or useAppConfig: true
    if (config.provider === 'basegeek-app' || config.useAppConfig || req.body.useAppConfig) {
      config.useAppConfig = true;
      delete config.provider;
    } else if (!config.provider && !config.freeOnly && declaresAppRouting(req.body)) {
      // Legacy auto-trigger: a body that names an app and no provider wants
      // app routing. It is now only a *switch* — the row looked up is the
      // resolved caller's, whatever name the body used. The AIGeek "Try it"
      // panel still sends neither, so it still exercises the raw rotation.
      config.useAppConfig = true;
    }

    // Identity is stamped last so nothing in the body can survive it.
    config.appName = caller.appId;
    config.feature = caller.feature;
    config.userId = caller.userId;

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
        req.log.debug({ resultLength: result?.length || 0, resultType: typeof result }, 'AI result received');

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
        // Headers are already out, so the frame is all the contract leaves us —
        // but it says the same allowlisted words the non-streaming catch would,
        // and the provider's body goes only to the redacting logger.
        const failure = resolveFailure(
          req, res, streamError,
          { stage: 'call_stream', model: config.model ?? null },
          '[ai] /call streaming upstream failure'
        );
        const errorChunk = {
          error: {
            message: failure.message,
            type: failure.type,
            code: failure.code
          }
        };
        res.write(`data: ${JSON.stringify(errorChunk)}\n\n`);
        res.end();
      }
    } else {
      // Non-streaming response (OpenAI-compatible format)
      const result = await aiService.callAI(prompt, config);
      const model = config.model || aiService.currentProvider;

      req.log.debug({ resultLength: result?.length }, 'Sending non-streaming response');

      // `usage` used to be three hardcoded zeros, which is worse than absent:
      // a caller cannot tell "no tokens" from "we didn't count". These are
      // local estimates from the same tokenCounter the /smart route above
      // uses — the rotation's providers do not all return usage, and an
      // estimate that is honest about being one beats a zero that lies.
      const promptTokens = Array.isArray(config.messages) && config.messages.length > 0
        ? countMessageTokens(config.messages)
        : countTextTokens(prompt || '');
      const completionTokens = countTextTokens(result || '');

      res.json({
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: model,
        // Additive, outside the OpenAI shape: rotation callers pass no
        // provider and had no way to learn which one actually answered. The
        // AIGeek playground reads it; OpenAI clients ignore unknown fields.
        provider: aiService.currentProvider,
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
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens,
          estimated: true
        }
      });
    }

  } catch (error) {
    if (!res.headersSent) {
      failUpstream(req, res, error, { stage: 'call', model: req.body?.config?.model ?? null });
    } else {
      req.log.error({ err: error }, 'Error in /api/ai/call after headers sent');
    }
  }
});

// POST /api/ai/parse-json - AI call with JSON parsing
//
// The second front door onto aiService.callAI, and until 2026-09-05 the
// unguarded one: no `ai:call` check and no resolveCaller, with `req.body.config`
// handed to callAI whole — which reads `appName`, `userId` and `useAppConfig`
// off it. Any credential, including a key minted with only `ai:models`, could
// route through another app's AIAppConfig row and bill that app and any userId
// it named. `92e7bc9` hardened five call sites and missed this one.
//
// It is gated exactly like /call now: same router-level auth, same permission,
// same caller resolution, identity stamped from the credential last so nothing
// in the body survives it. The body keeps the one thing it was ever entitled
// to say — which *feature* of the caller's own app is asking — plus the
// routing switches (`freeOnly`, `useAppConfig`), which choose a mode and not
// an identity.
router.post('/parse-json', async (req, res) => {
  try {
    // Check permission for API key users
    const permissionError = requirePermission(req, res, 'ai:call');
    if (permissionError) return;

    // Who is calling comes from the credential, never from the body.
    const caller = resolveCaller(req, req.body);
    logCaller(req, caller, '[ai] /parse-json caller');

    const { prompt } = req.body;
    const config = { ...(req.body.config || {}) };

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Prompt is required',
          code: 'MISSING_PROMPT'
        }
      });
    }

    // The same routing switches /call honours, in the same order.
    if (config.provider === 'free' || config.freeOnly || req.body.freeOnly) {
      config.freeOnly = true;
      delete config.provider;
    }

    if (config.provider === 'basegeek-app' || config.useAppConfig || req.body.useAppConfig) {
      config.useAppConfig = true;
      delete config.provider;
    } else if (!config.provider && !config.freeOnly && declaresAppRouting(req.body)) {
      config.useAppConfig = true;
    }

    // Identity is stamped last so nothing in the body can survive it.
    config.appName = caller.appId;
    config.feature = caller.feature;
    config.userId = caller.userId;

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
    // `details: error.message` was the leak here — the same provider body the
    // proxy stopped relaying, on a different envelope. A JSON parse failure is
    // an upstream one too: the model answered with something that was not JSON.
    failUpstream(req, res, error, { stage: 'parse_json', model: req.body?.config?.model ?? null });
  }
});

// GET /api/ai/providers - Get available AI providers
//
// Q45: this had no permission check at all, which made it the one AI route any
// authenticated credential could read whatever it was minted for. `ai:providers`
// is the enum entry named for exactly this — until now nothing consulted it —
// and it is in the default set every mint path grants (models/APIKey.js:45,
// routes/apiKeys.js:61, the GraphQL createAPIKey resolver, scripts/mint-api-key.js
// and the UI's apiKeyDraft), so no key minted through any of them loses access.
// `ai:models` would have worked too; `ai:providers` is chosen because a
// vocabulary with a dead word in it invites the next reader to add another.
//
// The one live caller is StoryGeek's own proxy (apps/storygeek/backend/src/
// routes/ai.js:15), which forwards the browser's SSO cookie — so what arrives
// here is a user JWT, and a JWT holds every permission. StoryGeek's settings
// page is unaffected.
router.get('/providers', async (req, res) => {
  try {
    const permissionError = requirePermission(req, res, 'ai:providers');
    if (permissionError) return;

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
//
// Q45, admin: this rewrites `aiService.currentProvider` — process-wide state
// that decides which vendor answers every rotation call the suite makes next,
// for every app and every user. Same class of thing as `/config`, so the same
// gate.
router.post('/provider', requireAdminUser, async (req, res) => {
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
//
// Q45: no permission check. `ai:models` is the obvious one and is in the
// default mint set, so no existing key loses the catalog.
router.get('/models/:provider', async (req, res) => {
  try {
    const permissionError = requirePermission(req, res, 'ai:models');
    if (permissionError) return;

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
//
// Q45, admin: spends the suite's provider credential against the vendor's
// catalog API and rewrites the shared AIModel collection every app then routes
// against. Not a per-caller operation in any reading.
router.post('/models/:provider/refresh', requireAdminUser, async (req, res) => {
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

    req.log.info({ provider }, 'Refreshing models');

    // Refresh models from provider API
    const models = await aiService.refreshModels(provider);

    req.log.info({ provider, modelCount: models.length }, 'Successfully refreshed models');

    res.json({
      success: true,
      data: {
        provider,
        models,
        message: `Models refreshed successfully for ${provider}`
      }
    });

  } catch (error) {
    req.log.error({ err: error, provider: req.params.provider }, 'Error refreshing models');
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

    req.log.info('AI Director models endpoint called');
    const result = await aiDirectorService.collectModelInformation();

    req.log.debug({ success: result.success, dataKeys: result.data ? Object.keys(result.data) : null }, 'AI Director result');

    if (result.success) {
      res.json({
        success: true,
        data: result.data
      });
    } else {
      req.log.error({ err: result.error }, 'AI Director failed');
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
    req.log.error({ err: error }, 'AI Director models endpoint error');
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

/**
 * GET /api/ai/director/free-models — REST parity for the GraphQL
 * `aiFreeModels` query. Every model the suite can call for nothing right now,
 * with the properties needed to pick between them: context window, JSON and
 * tool support, speed/quality/reasoning tiers, and the free-tier rate limits.
 *
 * Same `ai:director` permission as /director/models, and the same envelope, so
 * an API-key caller that can already read the catalog can read this.
 */
router.get('/director/free-models', async (req, res) => {
  try {
    const permissionError = requirePermission(req, res, 'ai:director');
    if (permissionError) return;

    const result = await aiDirectorService.listFreeModels();

    if (result.success) {
      res.json({ success: true, data: result.data });
    } else {
      req.log.error({ err: result.error }, 'Free model listing failed');
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to list free models',
          code: 'DIRECTOR_FREE_MODELS_ERROR',
          details: result.error?.details || 'Unknown error'
        }
      });
    }
  } catch (error) {
    req.log.error({ err: error }, 'AI Director free-models endpoint error');
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to list free models',
        code: 'DIRECTOR_FREE_MODELS_ERROR',
        details: error.message
      }
    });
  }
});

// POST /api/ai/director/analyze-cost - Analyze cost for a specific prompt
//
// Q45: a POST that mutates nothing — it prices a hypothetical prompt against
// the pricing table. It takes `ai:director`, the permission its two GET
// siblings (`/director/models`, `/director/free-models`) already use, and not
// the admin gate: requireAdminUser refuses API keys outright, and this is
// documented in DOCS/API_KEYS.md as one of the endpoints a key may call.
router.post('/director/analyze-cost', async (req, res) => {
  try {
    const permissionError = requirePermission(req, res, 'ai:director');
    if (permissionError) return;

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
//
// Q45: read-only like analyze-cost, and `ai:director` for a second reason —
// StoryGeek's epub pipeline calls it from a backend
// (apps/storygeek/backend/src/services/aiService.js:395, whose sibling
// getDirectorModels already carries the note "Needs the ai:director permission
// — mint the key with it"). An admin gate would refuse that credential on the
// spot, because a key belongs to an app and not to a person.
router.post('/director/recommend', async (req, res) => {
  try {
    const permissionError = requirePermission(req, res, 'ai:director');
    if (permissionError) return;

    const { task, budget, priority = 'cost', requirements = {}, freeOnly, limit } = req.body;

    if (!task) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Task description is required',
          code: 'MISSING_TASK'
        }
      });
    }

    // `freeOnly` and `limit` are additive: a body without them behaves exactly
    // as it did before, which is what StoryGeek's epub pipeline sends
    // (apps/storygeek/backend/src/services/aiService.js — task, priority,
    // requirements, and it reads recommendations[0].model.id back out).
    const result = await aiDirectorService.recommendProvider(task, {
      budget: budget ?? null,
      priority,
      requirements,
      freeOnly: freeOnly === true,
      limit: Number.isInteger(limit) ? limit : null
    });

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
//
// Q45, admin: writes the shared pricing table every routing and cost decision
// in the suite reads. The three director mutators below are the same case.
router.post('/director/seed-pricing', requireAdminUser, async (req, res) => {
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
router.post('/director/seed-free-tier', requireAdminUser, async (req, res) => {
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
router.post('/director/force-refresh', requireAdminUser, async (req, res) => {
  try {
    const providers = ['anthropic', 'groq', 'gemini', 'together'];
    const results = {};

    for (const provider of providers) {
      try {
        const hasApiKey = !!aiService.providers[provider]?.apiKey;
        const isEnabled = aiService.providers[provider]?.enabled || false;

        if (hasApiKey && isEnabled) {
          req.log.info({ provider }, 'Force refreshing');
          await aiService.refreshModels(provider);
          results[provider] = 'success';
        } else {
          results[provider] = 'skipped (no API key or disabled)';
        }
      } catch (error) {
        req.log.error({ err: error, provider }, 'Failed to force refresh');
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
//
// Q45: `req.query.userId || req.user.id` meant any authenticated credential
// could read any user's usage summary for a provider by naming them — how much
// they have spent, against which models, and how close to a free-tier ceiling
// they are. "Allow session-level tracking" was the intent; taking an id off the
// query string was the mechanism, and a query string is not a credential.
//
// The identity now comes from the caller, exactly as the sibling
// `/usage/:provider/:modelId` two routes up has always done. `?userId=` is
// ignored rather than refused: nothing in the suite sends it — nothing in the
// suite calls this route at all over HTTP, the AIGeek console reads usage
// through the in-process GraphQL `aiUsage` query — so a 400 would only turn a
// silent no-op into a broken page for a caller who was never entitled to the
// answer anyway.
//
// The route keeps its lack of an `ai:usage` permission check, which is a
// separate question from whose data it returns: `ai:usage` is not in the
// default mint set, so adding it here would be a breaking change to a
// permission nothing has yet been granted. Filed, not fixed.
router.get('/usage/:provider', async (req, res) => {
  try {
    const { provider } = req.params;
    const userId = req.user.id;

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
//
// Q45, admin: `resetSessionStats()` is process-wide. One caller clearing the
// counters blinds `/stats`, `/provider-health` and the AIGeek console for
// everyone at once.
router.post('/reset-stats', requireAdminUser, async (req, res) => {
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
router.get('/config', requireAdminUser, async (req, res) => {
  try {
    const configs = await AIConfig.find({});

    // Never the key itself: { hasKey, keyHint, enabled } per provider. The
    // admin UI needs to know a key is *there* and which one it is, and
    // nothing more — a decrypted credential on the wire is a credential in
    // every proxy log and browser cache between here and the tab.
    const config = {};
    for (const provider of CONFIG_PROVIDERS) {
      config[provider] = { hasKey: false, keyHint: '', enabled: false };
    }
    config.cloudflare.accountId = '';

    for (const dbConfig of configs) {
      if (!config[dbConfig.provider]) continue;
      const key = dbConfig.getDecryptedKey() ?? '';
      config[dbConfig.provider].hasKey = Boolean(key);
      config[dbConfig.provider].keyHint = keyHintFor(key);
      config[dbConfig.provider].enabled = dbConfig.enabled;

      // Handle Cloudflare-specific fields
      if (dbConfig.provider === 'cloudflare' && dbConfig.accountId) {
        config[dbConfig.provider].accountId = dbConfig.accountId;
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
router.post('/config', requireAdminUser, async (req, res) => {
  try {
    // Only providers actually present in the body are touched. A provider may
    // now arrive with no apiKey at all — the client can no longer read the
    // stored key back, so a blank field means "keep what's there", never
    // "clear it". Everything else on the entry (enabled, accountId) is still
    // written, which the old shape could not do: it skipped the whole update
    // unless a key came with it, so toggling Enabled on a configured provider
    // silently did nothing.
    const configs = CONFIG_PROVIDERS
      .filter(provider => req.body[provider] && typeof req.body[provider] === 'object')
      .map(provider => ({ provider, ...req.body[provider] }));

    for (const config of configs) {
      const newKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : '';
      const hasNewKey = newKey !== '' && newKey !== '***';

      const updateData = { enabled: config.enabled || false };

      // Handle Cloudflare-specific fields
      if (config.provider === 'cloudflare' && config.accountId) {
        updateData.accountId = config.accountId.trim();
      }

      if (hasNewKey) {
        updateData.apiKey = encrypt(newKey); // encrypt before persisting
        await AIConfig.findOneAndUpdate(
          { provider: config.provider },
          updateData,
          { upsert: true, new: true }
        );
      } else {
        // No upsert without a key: AIConfig.apiKey is required, so creating a
        // keyless doc would only throw. Nothing stored, nothing to update.
        await AIConfig.updateOne({ provider: config.provider }, { $set: updateData });
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
router.post('/test', requireAdminUser, async (req, res) => {
  try {
    const { provider } = req.body;
    // /test is admin-gated, so the caller is always a JWT admin; the app is
    // whatever their token says, not what the body claims.
    const caller = resolveCaller(req, req.body);
    logCaller(req, caller, '[ai] /test caller');
    const appName = caller.appId;
    req.log.info({ provider }, '[AI Test] Testing provider');

    if (!provider) {
      req.log.warn('[AI Test] No provider specified');
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
      req.log.warn({ provider }, '[AI Test] Provider not found in configuration');
      return res.status(400).json({
        success: false,
        error: {
          message: `Provider '${provider}' is not supported`,
          code: 'UNKNOWN_PROVIDER'
        }
      });
    }

    if (!providerConfig.apiKey) {
      req.log.warn({ provider }, '[AI Test] API key is not configured');
      return res.status(400).json({
        success: false,
        error: {
          message: `${provider} API key is not configured`,
          code: 'API_KEY_NOT_CONFIGURED'
        }
      });
    }

    const maskedKey = providerConfig.apiKey.substring(0, 8) + '...' + providerConfig.apiKey.substring(providerConfig.apiKey.length - 4);
    req.log.info({ provider, maskedKey }, '[AI Test] API key found, making test call');

    // Test the provider with a simple prompt
    const testPrompt = 'Hello, this is a test message. Please respond with "OK" if you receive this.';
    const result = await aiService.callProvider(provider, testPrompt, {
      maxTokens: 10,
      appName,
      feature: caller.feature
    });

    req.log.info({ provider, preview: result.content?.substring(0, 50) }, '[AI Test] API call successful');

    if (result && result.content && result.content.toLowerCase().includes('ok')) {
      req.log.info({ provider }, '[AI Test] API key is VALID');
      res.json({
        success: true,
        data: {
          message: `${provider} API key is valid`,
          response: result.content,
          appName
        }
      });
    } else {
      req.log.info({ provider }, '[AI Test] API key valid (response received, no "OK")');
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
    req.log.error({ err: error }, '[AI Test] Test failed');
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

// ============================================================================
// Phase 2A: Smart Routing Endpoints
// ============================================================================

/**
 * POST /api/ai/call-smart
 * Smart AI call with Phase 2A family-based routing
 */
router.post('/call-smart', async (req, res) => {
  req.log.info('--- /api/ai/call-smart invoked (Phase 2A) ---');

  try {
    // Check permission for API key users
    const permissionError = requirePermission(req, res, 'ai:call');
    if (permissionError) return;

    const caller = resolveCaller(req, req.body);
    logCaller(req, caller, '[ai] /call-smart caller');

    const { messages, conversationId, taskTypeHint, dryRun } = req.body;
    const userId = caller.userId || req.user.id;

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
      // Credential, not body — see services/callerIdentity.js.
      appName: caller.appId,
      feature: caller.feature
    });

    res.json(result);

  } catch (error) {
    req.log.error({ err: error }, '[API] Smart routing error');
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
    const familyRouter = new ModelFamilyRouter();
    const stats = await familyRouter.getRoutingStats();

    res.json({
      success: true,
      families: stats.families,
      taskRouting: stats.taskRouting,
      config: stats.config
    });

  } catch (error) {
    req.log.error({ err: error }, '[API] Families error');
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
    req.log.error({ err: error }, '[API] Provider health error');
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
    req.log.error({ err: error }, '[API] Context reset error');
    res.status(500).json({
      success: false,
      error: {
        message: error.message || 'Failed to reset context',
        code: 'CONTEXT_RESET_ERROR'
      }
    });
  }
});

// POST /api/ai/cache/clear - Clear response cache
//
// Q45, admin: the response cache is shared across every app. Emptying it on
// demand is both a suite-wide operation and a way to make the suite pay a
// provider for answers it already had.
router.post('/cache/clear', requireAdminUser, async (req, res) => {
  try {
    aiService.clearCache();
    res.json({
      success: true,
      message: 'Cache cleared successfully'
    });
  } catch (error) {
    req.log.error({ err: error }, '[API] Cache clear error');
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
//
// Q45, admin: sets `aiService.summarizationEnabled` / `summarizationThreshold`
// on the singleton — configuration, for every conversation in every app, from
// an unguarded POST.
router.post('/summarization', requireAdminUser, async (req, res) => {
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
    req.log.error({ err: error }, '[API] Summarization config error');
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


