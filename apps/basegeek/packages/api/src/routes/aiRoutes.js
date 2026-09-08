import express from 'express';
import { requireRole, lookupRole } from '../middleware/auth.js';
import { PROVIDER_IDS, keyHintFor } from '../config/aiProviders.js';
import { authenticateJWTOrAPIKey, requirePermission } from '../middleware/apiKeyAuth.js';
import {
  resolveCaller,
  resolveConversationOwner,
  logCaller,
} from '../services/callerIdentity.js';
import { resolveFailure } from '../services/aiFailureEnvelope.js';
import { legacyRoutingSwitches } from '../services/aiRoute.js';
import { runFeatureCore, DEFAULT_TIMEOUT_MS, DEFAULT_HTTP_MAX_CALLS_PER_DAY } from '../services/aiFeatureRunner.js';
import logger from '../lib/logger.js';
import aiService from '../services/aiService.js';
import aiDirectorService from '../services/aiDirectorService.js';
import aiUsageService from '../services/aiUsageService.js';
import conversationService from '../services/conversationService.js';
import { countTextTokens, countMessageTokens } from '../services/tokenCounter.js';
import AIConfig from '../models/AIConfig.js';
import { encrypt } from '@geeksuite/crypto-vault';
import AIModel from '../models/AIModel.js';
import AIFreeTier, { isFreeTierCooling } from '../models/AIFreeTier.js';
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
 * as `` `Gemini API error (${status}): ${JSON.stringify(error.response.data)}` ``
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

/**
 * applyRoutingSwitches — the legacy body→config translation, in one place.
 *
 * `/call` and `/parse-json` both had their own copy of this, and they had
 * already drifted once (`/parse-json` was missing the `ai:call` gate entirely
 * until 2026-09-05). The vocabulary itself now lives in
 * `services/aiRoute.js` — see `legacyRoutingSwitches` — so these two routes
 * name none of it, and `resolveRoute` is the only reader of `freeOnly`,
 * `useAppConfig` and the `basegeek-*` aliases in the whole service.
 *
 * Mutates `config` in place, because that is the object about to be handed to
 * `callAI` and both routes then stamp identity onto it.
 */
const applyRoutingSwitches = (config, body) => {
  const patch = legacyRoutingSwitches(body, config);
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete config[key];
    else config[key] = value;
  }
  return config;
};

/**
 * `/api/ai/call` is deprecated (D2). One log line per caller app per hour —
 * enough to see who is still on it before it is deleted, quiet enough that a
 * busy consumer does not fill the log with its own obituary.
 */
const DEPRECATION_LOG_INTERVAL_MS = 60 * 60 * 1000;
const deprecationLoggedAt = new Map();

/**
 * Is this caller's app due a deprecation line? Records the decision, so it is
 * one call per app per hour and not one per request.
 *
 * Separated from `markDeprecated` because the throttle is the part worth
 * testing and a pino child logger cannot be spied on after the fact — the
 * child binds its methods at creation, so patching the parent's `warn` after
 * `pino-http` has run catches nothing.
 */
export const _deprecationDue = (appId, now = Date.now()) => {
  const last = deprecationLoggedAt.get(appId) || 0;
  if (now - last < DEPRECATION_LOG_INTERVAL_MS) return false;
  deprecationLoggedAt.set(appId, now);
  return true;
};

/** Test hook: the hourly throttle is process state, and a suite is not an hour. */
export const _resetDeprecationLog = () => deprecationLoggedAt.clear();

const markDeprecated = (req, res, caller, replacement) => {
  // RFC 8594's `Deprecation` header. `true` rather than a date: the date this
  // route goes away is the next deploy after fitnessgeek and storygeek are
  // verified on the feature door, and inventing a timestamp for it would be
  // fiction.
  res.setHeader('Deprecation', 'true');
  res.setHeader('Link', `<${replacement}>; rel="successor-version"`);

  if (!_deprecationDue(caller.appId)) return;
  req.log.warn(
    { app: caller.appId, feature: caller.feature, source: caller.source, replacement },
    '[ai] /api/ai/call is deprecated — this app should move to POST /api/ai/feature'
  );
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
        // Phase 1 (2026-09-07): the declared per-provider limits table is
        // gone — quotas are learned from `x-ratelimit-*` headers into
        // AIFreeTier.freeLimits/observed. `aiService.rateLimits[p]` now holds
        // only a live 429 cooldown, so that is all this reports.
        rateLimitStatus: {
          isRateLimited: rateLimits?.rateLimitedUntil ? Date.now() < rateLimits.rateLimitedUntil : false,
          rateLimitedUntil: rateLimits?.rateLimitedUntil || null
        }
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
 * conversationOwner — the id every conversation route on this router scopes by.
 *
 * Q62 (2026-09-06). Before this, the five routes below disagreed with each
 * other: `POST /conversation/message` filed under `resolveCaller().userId`,
 * which for an API-key caller prefers a `userId` the *body* named, while the
 * four read/state routes used `req.user.id`, which is the credential. A key
 * caller that named a user therefore wrote conversations it could never read
 * back, and — had the read routes ever been "fixed" to agree with the write
 * route instead — any `ai:call` key could have read any user's stored
 * messages by naming them. A body field is not a credential.
 *
 * All five now come through here, and ownership is the credential's:
 * `apikey_<keyId>` for a key, the user id for a JWT. See
 * services/callerIdentity.js for why `apikey_<keyId>` and not the key's owner,
 * and why this is deliberately *not* the same question as which user the call
 * is billed to (that stays `resolveCaller().userId`, and the two ids differ on
 * purpose in `/conversation/message` below).
 *
 * The one exception is an admin JWT, which may name a user in the body — the
 * operator escape hatch for repair and seeding. The userGeek role lookup it
 * needs costs a query, so it is only made when a body actually disagrees with
 * the credential; the routes that carry no body never pay for it and never
 * have an exception to apply.
 *
 * @param {import('express').Request} req
 * @returns {Promise<{ownerId: string|null, source: string, claimed: string|null,
 *                    honoured: boolean}>}
 */
async function conversationOwner(req) {
  const body = req.body || {};
  const claimed = body.userId ?? body.config?.userId ?? body.user;
  const self = req.user?.id == null ? null : String(req.user.id);
  let isAdmin = false;

  if (claimed != null && req.user?.type !== 'api_key' && String(claimed) !== self) {
    try {
      isAdmin = (await lookupRole(self)) === 'admin';
    } catch (err) {
      // A malformed id or an unreachable userGeek is not an admin. Fail closed
      // to the credential's own id rather than 500 a conversation call.
      req.log?.warn({ err }, '[ai] conversation owner role lookup failed');
    }
  }

  const owner = resolveConversationOwner(req, body, { isAdmin });

  if (owner.claimed && owner.claimed !== owner.ownerId) {
    req.log?.debug(
      { source: owner.source, honoured: owner.honoured },
      '[ai] body userId ignored — conversation ownership comes from the credential'
    );
  }

  return owner;
}

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
      model
    } = req.body;

    // Same rule as /call: the app is the credential's, not the body's. The
    // conversation record carries it too, so a conversation cannot be filed
    // under an app its caller does not hold a credential for.
    const caller = resolveCaller(req, req.body);
    logCaller(req, caller, '[ai] /conversation/message caller');
    const appName = caller.appId;

    // Two ids, and they are allowed to differ. `owner.ownerId` is who the
    // stored conversation belongs to — the credential, never the body (Q62).
    // `caller.userId` is who the provider call is *billed* to, which for a
    // service key may legitimately be a person the body named, or every call
    // from storygeek would share one free-tier quota bucket. Ownership is not
    // accounting; see conversationOwner() above.
    const owner = await conversationOwner(req);
    const userId = owner.ownerId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { message: 'Unable to identify the caller', code: 'UNIDENTIFIED_CALLER' }
      });
    }

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

    // Call AI with full context.
    //
    // `callAISmart` used to sit between this route and `callAI`, wrapping the
    // answer in `{success, content, routing}`. It was the last survivor of the
    // second routing stack (Phase 0's note on it is in aiService.js) and Phase
    // 2 deleted it: it read `routing` out of `lastProviderInfo`, which is
    // right here, and its `{success:false}` resolution only existed so this
    // route could throw the string back — which Q46 then had to stop it
    // doing. So the route calls `callAI` directly and builds the same two
    // things itself; a provider failure lands in the catch, where
    // `resolveFailure` has always owned the envelope.
    //
    // The body's legacy routing switches still work — they go through the same
    // translation `/call` and `/parse-json` use, so `resolveRoute` is the only
    // reader of that vocabulary anywhere in the service. A free signal is a
    // hint on `auto` and a veto on `allowPaid`, so "free" still means free.
    const routingOptions = {
      conversationId,
      taskTypeHint: metadata?.taskTypeHint,
      userId: caller.userId || userId,
      appName,
      feature: caller.feature,
    };
    applyRoutingSwitches(routingOptions, { ...req.body, provider });

    /**
     * One turn, in the shape the two branches below want. Resolves rather than
     * throwing on a provider failure, exactly as the deleted shim did, so the
     * streaming branch can turn it into an error frame and the non-streaming
     * one into the ordinary envelope.
     */
    const askModel = async () => {
      const startedAt = Date.now();
      try {
        const content = await aiService.callAI(
          allMessages[allMessages.length - 1]?.content || '',
          { ...routingOptions, messages: allMessages }
        );
        const info = aiService.lastProviderInfo || {};
        return {
          success: true,
          content,
          routing: {
            provider: info.provider || aiService.currentProvider,
            model: info.model || null,
            cached: !!info.cached,
            latency: Date.now() - startedAt,
          },
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    };

    // Declared out here, not inside the `if (stream)` block. They used to be
    // block-scoped to the streaming branch while the NON-streaming branch below
    // read them for its `usage` object — so every non-streaming call threw
    // `ReferenceError: promptTokens is not defined` after the provider call had
    // already been paid for and the assistant turn already saved, and answered
    // 500 with the completion thrown away.
    let promptTokens = 0;
    let completionTokens = 0;

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      try {
        const smartResult = await askModel();

        if (!smartResult.success) {
          throw new Error(smartResult.error || 'AI routing failed');
        }

        const result = formatResponse(smartResult.content);

        promptTokens = countMessageTokens(allMessages);
        completionTokens = countTextTokens(result);
        
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
        // `routing.provider` is a provider id; this field is a model id.
        // `askModel` reports both, so prefer the model.
        const usedModel = smartResult.routing?.model
          || smartResult.routing?.provider
          || aiService.currentProvider;

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
        // Q46's allowlist, extended to this route: `streamError.message` is
        // built in aiService as `<Provider> API error (<status>): <raw body>`
        // (or `All providers in <family> family failed: <same>`), so writing it
        // into the frame handed the caller the vendor's name, org/project ids
        // and quota detail. The provider's words go to the redacting logger;
        // the caller gets the same allowlisted envelope /call streams.
        const failure = resolveFailure(
          req, res, streamError,
          { stage: 'conversation_stream', conversationId },
          '[Phase3] streaming upstream failure'
        );
        res.write(`data: ${JSON.stringify({
          error: { message: failure.message, type: failure.type, code: failure.code }
        })}\n\n`);
        res.end();
      }
    } else {
      // Non-streaming
      const smartResult = await askModel();

      if (!smartResult.success) {
        throw new Error(smartResult.error || 'AI routing failed');
      }

      const result = formatResponse(smartResult.content);

      promptTokens = countMessageTokens(allMessages);
      completionTokens = countTextTokens(result);
      
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
        // A model id, not a provider id — see the streaming branch above.
        model: smartResult.routing?.model
          || smartResult.routing?.provider
          || aiService.currentProvider,
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
    // Same envelope as /call and /parse-json. This catch used to answer with a
    // bare `error.message`, which on the provider-failure path is the raw
    // upstream body Q46 removed from the other three routes.
    if (!res.headersSent) {
      failUpstream(req, res, error, { stage: 'conversation_message', conversationId: req.body?.conversationId ?? null });
    } else {
      req.log.error({ err: error }, '[Phase3] Error after headers sent');
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
    const userId = (await conversationOwner(req)).ownerId;

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

    const userId = (await conversationOwner(req)).ownerId;
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
    const userId = (await conversationOwner(req)).ownerId;

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
    const userId = (await conversationOwner(req)).ownerId;

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
// The feature door (Phase 2, DOCS/AIGEEK_FRONT_DOOR.md §4)
// ============================================================================
//
// `aiFeatureRunner` has been the one door every *in-gateway* AI feature walks
// through since night 2: routing row, per-user daily cap, deterministic
// fallback, provenance. Consumers outside the gateway got none of it. They
// called `/api/ai/call` with their own axios wrappers, no fallback, and 500'd
// to the user on any failure — a free-tier hiccup showed up as a broken app.
//
// This is that contract over HTTP. Two things about it are deliberate and
// worth saying out loud:
//
//   1. **A model failure is a 200.** `{ ok: false, reason, provenance }`. The
//      deterministic fallback for an out-of-process feature lives out there
//      with the feature — the food-parse comma split, "the assistant isn't
//      available right now" — so this route's job is to say *clearly* that no
//      model answered, not to make the consumer parse a 5xx to find out. A
//      4xx/5xx here still means what it always means: the request was wrong,
//      or the gateway is broken.
//   2. **The app comes from the credential.** Same rule as every other AI
//      route (services/callerIdentity.js). The body names a *feature* of the
//      caller's own app and nothing else about who is calling.

/** `timeoutMs` bounds. Below a second nothing free answers; above a minute no
 *  HTTP client is still listening. §4. */
const FEATURE_TIMEOUT_MIN_MS = 1000;
const FEATURE_TIMEOUT_MAX_MS = 60000;

const clampTimeout = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_TIMEOUT_MS;
  return Math.min(FEATURE_TIMEOUT_MAX_MS, Math.max(FEATURE_TIMEOUT_MIN_MS, Math.round(parsed)));
};

/** A positive integer from the body, or the runner's default. */
const positiveIntOr = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
};

/**
 * POST /api/ai/feature
 *
 * request:  { feature, messages?: [{role, content}], system?, user?,
 *             schema?: { name, description?, schema }, timeoutMs?,
 *             conversationId?, provider?, model?, quotaKey?,
 *             maxTokens?, temperature?, maxCallsPerDay? }
 * response: 200 { ok: true,  data, provenance }
 *           200 { ok: false, reason, provenance }
 *              reason ∈ cap | unavailable | unparseable | empty | invalid
 *
 * `provider` + `model` are an explicit pin — StoryGeek's player picker, whose
 * options come from `GET /api/ai/models/alive`. Both or neither: a provider
 * with no model would quietly mean "that provider's default", which is not
 * what a picker means. A pin whose catalog row is cooling or gone degrades to
 * the app's ordinary `auto` walk (the sticky pick, where there is one) and
 * `provenance.hints` carries `pin_unavailable`, so the consumer can show a
 * notice instead of failing the turn.
 *
 * `quotaKey` is a cap-bucket segment and nothing else. It is honoured **only**
 * when the credential names no user — which is every service-key caller, since
 * a key has no session — and it is never treated as an identity, never
 * resolved to a user, never logged as one, and never forwarded to `callAI`,
 * `AIUsage`, `AISpend` or a conversation's ownership. A body may name a
 * counter segment because the worst a liar gets is a fresh quota, which the
 * free tier's own rate limits and the paid governor already bound; that
 * reasoning does not extend to anything else a body says (see
 * services/callerIdentity.js).
 */
router.post('/feature', async (req, res) => {
  try {
    const permissionError = requirePermission(req, res, 'ai:call');
    if (permissionError) return;

    // `resolveCaller` is handed a *narrowed* view of the body, not the body.
    //
    // For an API-key caller it reads `payload.userId ?? payload.config?.userId
    // ?? payload.user` — the `user` fallback being an old spelling for "the
    // person this service is calling on behalf of". On this route `user` is
    // the **user turn's text**, so the whole body would have made a prompt
    // into a billing identity: `{ user: 'hi' }` would bill every call in the
    // suite to a user called `hi`, and pool their free-tier quota. (Long
    // prompts escaped it only because `normalizeUserId` caps at 64 chars,
    // which is luck, not a design.)
    //
    // So this route hands over exactly the two fields a body is entitled to
    // speak about identity — the feature, and the user a service key is
    // calling for — and the prompt stays a prompt.
    const caller = resolveCaller(req, {
      feature: req.body?.feature,
      userId: req.body?.userId,
    });
    logCaller(req, caller, '[ai] /feature caller');

    // The feature name is the one thing the body legitimately says about who
    // is calling, and it is required: the daily cap is counted per feature,
    // and an unnamed feature would share one bucket with every other.
    const feature = caller.feature;
    if (!feature) {
      return res.status(400).json({
        ok: false,
        reason: 'invalid_request',
        error: { message: 'feature is required', code: 'MISSING_FEATURE' }
      });
    }

    const {
      messages = null,
      system = null,
      user = null,
      schema = null,
      conversationId = null,
      provider = null,
      model = null,
      quotaKey = null,
      temperature,
      maxTokens,
      maxCallsPerDay,
      timeoutMs
    } = req.body || {};

    const haveTurns = Array.isArray(messages) && messages.length > 0;
    if (!haveTurns && !user && !system) {
      return res.status(400).json({
        ok: false,
        reason: 'invalid_request',
        error: { message: 'messages, or system/user, are required', code: 'MISSING_MESSAGES' }
      });
    }
    if (schema && (typeof schema !== 'object' || !schema.name || !schema.schema)) {
      return res.status(400).json({
        ok: false,
        reason: 'invalid_request',
        error: { message: 'schema must be { name, description?, schema }', code: 'INVALID_SCHEMA' }
      });
    }
    // Both or neither. Refused rather than half-honoured: a picker that sends
    // only a provider has a bug, and answering it from that provider's default
    // model would hide it behind a plausible answer.
    const wantsPin = !!(provider || model);
    if (wantsPin && !(typeof provider === 'string' && provider && typeof model === 'string' && model)) {
      return res.status(400).json({
        ok: false,
        reason: 'invalid_request',
        error: { message: 'provider and model must be sent together', code: 'INCOMPLETE_PIN' }
      });
    }
    if (wantsPin && !PROVIDER_IDS.includes(provider)) {
      return res.status(400).json({
        ok: false,
        reason: 'invalid_request',
        error: { message: 'provider is not one this gateway serves', code: 'UNKNOWN_PROVIDER' }
      });
    }

    // Whether the cap may be split by the body's `quotaKey`. For a key
    // caller, `caller.userId` is the key's *owner* — the admin who minted it
    // — which is one bucket for every player of every story that key serves.
    const bodyNamedUser = typeof req.body?.userId === 'string' && !!req.body.userId.trim();
    const splitsQuota = caller.source === 'api_key'
      && !bodyNamedUser
      && typeof quotaKey === 'string'
      && !!quotaKey.trim();

    // The cap, in order of who knows best: this request, then the app's
    // routing row, then the door's default. Read-only — `routingRowFor`'s
    // `lastSeen` touch and auto-discovery belong to `callAI`, which is about
    // to do them anyway.
    let rowCap = null;
    try {
      const row = await aiService.findAppConfig(caller.appId);
      rowCap = Number.isFinite(Number(row?.dailyCap)) && Number(row.dailyCap) > 0
        ? Math.floor(Number(row.dailyCap))
        : null;
    } catch (rowError) {
      req.log.debug({ err: rowError }, '[ai] /feature could not read the routing row cap');
    }

    const core = await runFeatureCore({
      app: caller.appId,
      feature,
      // The cap is keyed `app:feature:userId:day`, exactly as in process. A
      // service key carries no session, so `userId` is null and the app-wide
      // bucket is the right one — that is the honest accounting for a backend
      // calling on nobody's behalf in particular.
      userId: caller.userId,
      // Only for a credential with no session that has not named a user. A
      // JWT *is* a session, so its cap is counted against the person holding
      // it and a body cannot hand itself a fresh quota; and a key that named
      // the user it is calling for has already told us the bucket.
      ...(splitsQuota ? { quotaKey } : {}),
      system: typeof system === 'string' ? system : undefined,
      user: typeof user === 'string' ? user : undefined,
      ...(haveTurns ? { messages } : {}),
      ...(schema ? { schema } : {}),
      ...(typeof conversationId === 'string' && conversationId ? { conversationId } : {}),
      ...(wantsPin ? { provider, model } : {}),
      ...(Number.isFinite(Number(temperature)) ? { temperature: Number(temperature) } : {}),
      ...(maxTokens !== undefined ? { maxTokens: positiveIntOr(maxTokens, undefined) } : {}),
      maxCallsPerDay: positiveIntOr(maxCallsPerDay, rowCap ?? DEFAULT_HTTP_MAX_CALLS_PER_DAY),
      timeoutMs: clampTimeout(timeoutMs)
    });

    return res.json(
      core.ok
        ? { ok: true, data: core.data, provenance: core.provenance }
        : { ok: false, reason: core.reason, provenance: core.provenance }
    );
  } catch (error) {
    // Only a genuine gateway fault reaches here — `runFeatureCore` turns every
    // model-side outcome into `ok: false`. Same allowlisted envelope as the
    // other doors: the provider's own words never leave the process (Q46).
    return failUpstream(req, res, error, { stage: 'feature', feature: req.body?.feature ?? null });
  }
});

/**
 * GET /api/ai/models/alive
 *
 * `[{ provider, modelId, fitness, paid, lastSuccessAt }]` — every free row the
 * catalog currently believes answers, plus the governed `paid-fallback` set.
 * Deliberately a bare array, not the `{success, data}` envelope the older
 * routes use: this is what a picker renders, and StoryGeek's player picker is
 * its first consumer (§5).
 *
 * This replaces every hand-typed model list in a consumer's UI. Nobody types
 * a model id again (D4) — the list is observed, by the catalog job, hourly.
 */
router.get('/models/alive', async (req, res) => {
  try {
    const permissionError = requirePermission(req, res, 'ai:models');
    if (permissionError) return;

    const [freeRows, paidRows] = await Promise.all([
      AIFreeTier.find({ isFree: true }).lean(),
      AIModel.find({ role: 'paid-fallback', isActive: true }).lean()
    ]);

    const configured = (provider) => {
      const providerConfig = aiService.providers[provider];
      return !!providerConfig?.apiKey && providerConfig.enabled !== false;
    };

    const alive = [];
    for (const row of freeRows) {
      if (!configured(row.provider)) continue;
      // The same health view selection uses, mirror included, so the picker
      // and the router cannot disagree about what is alive.
      const health = aiService.getFreeTierHealth(row.provider, row.modelId, row.health);
      if (isFreeTierCooling(health)) continue;
      alive.push({
        provider: row.provider,
        modelId: row.modelId,
        fitness: row.fitness ?? null,
        paid: false,
        lastSuccessAt: health.lastSuccessAt ?? null
      });
    }
    for (const row of paidRows) {
      if (!configured(row.provider)) continue;
      const health = aiService.getFreeTierHealth(row.provider, row.modelId);
      if (isFreeTierCooling(health)) continue;
      alive.push({
        provider: row.provider,
        modelId: row.modelId,
        fitness: row.capabilities?.tasks?.structuredOutput ? 'structured' : null,
        paid: true,
        lastSuccessAt: health.lastSuccessAt ?? null
      });
    }

    return res.json(alive);
  } catch (error) {
    req.log.error({ err: error }, '[ai] /models/alive failed');
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to list alive models', code: 'ALIVE_MODELS_ERROR' }
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
    markDeprecated(req, res, caller, '/api/ai/feature');

    const stream = req.body.stream || false;

    // Support both legacy 'prompt' and OpenAI-style 'messages' array
    let messages = req.body.messages;
    let prompt = req.body.prompt;
    let config = req.body.config || {};

    // The routing switches this route has always honoured — `provider: "free"`,
    // `freeOnly`, `provider: "basegeek-app"`, `useAppConfig`, and the legacy
    // auto-trigger for a body that names an app and no provider. They live in
    // `services/aiRoute.js` now, with the rest of the legacy vocabulary, so
    // this route no longer has an opinion about routing: it hands the config
    // to `callAI`, which resolves one Route through `resolveRoute` like every
    // other door. The switches choose a *mode*, never an identity.
    applyRoutingSwitches(config, req.body);

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
        // `model` used to fall back to `aiService.currentProvider` — a
        // PROVIDER id in a field OpenAI clients read as a model id, on every
        // rotation call that named no model. `lastProviderInfo` is stamped by
        // callAI with the provider and model that actually answered (cache
        // hits included), so the fallback is now the real model; the provider
        // id stays only as the last resort when even that is missing.
        const answered = aiService.lastProviderInfo || {};
        const model = config.model || answered.model || aiService.currentProvider;

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
      // Same fix as the streaming branch above: the model that answered, not
      // the default provider's id wearing the `model` field.
      const answered = aiService.lastProviderInfo || {};
      const model = config.model || answered.model || aiService.currentProvider;

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
        //
        // It reported `currentProvider` — the DEFAULT — which is the one thing
        // the caller could already work out, and which is wrong for every call
        // the rotation, the free-tier walk or the app-config row sent
        // somewhere else. `lastProviderInfo.provider` is what answered.
        provider: answered.provider || aiService.currentProvider,
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

    // The same routing switches /call honours, from the same function.
    applyRoutingSwitches(config, req.body);

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
        // The provider that answered, not the process default — the same bug
        // /call carried, fixed the same way.
        provider: aiService.lastProviderInfo?.provider || aiService.currentProvider
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
    // `costPer1kTokens` (one blended per-provider rate) went with Phase 1
    // (2026-09-07): cost is now per call, from the provider's own `usage.cost`
    // or AIPricing, and lands in AISpend. Nothing consumed the field.
    const providerInfo = availableProviders.map(provider => ({
      name: provider,
      displayName: aiService.providers[provider].name
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

// `POST /director/seed-pricing` and `POST /director/seed-free-tier` stood here
// until 2026-09-07. Both took an admin's click and wrote a hand-typed table
// over the shared catalog: ~45 prices and ~30 free-tier quota rows, typed from
// vendor docs that change monthly and last checked by whoever typed them. Three
// such quota tables existed and disagreed with each other.
//
// Phase 1 of DOCS/AIGEEK_ELEVATION_PLAN.md replaced both with observation: the
// catalog job (apps/basegeek/DOCS/AIGEEK_CATALOG_JOB.md) discovers models,
// probes them under our own account, and learns quotas from the `x-ratelimit-*`
// headers on real calls. Nothing seeds a price or a limit from a literal any
// more, so there is nothing to restore defaults from. `POST
// /director/force-refresh` below and `POST /models/:provider/refresh` above are
// the admin doors that remain.

// POST /api/ai/director/force-refresh - Force refresh all providers
//
// Q45, admin: spends the suite's provider credentials against every vendor's
// catalog API and rewrites the shared AIModel collection every app then routes
// against. Not a per-caller operation in any reading.
router.post('/director/force-refresh', requireAdminUser, async (req, res) => {
  try {
    // The roster, not a copy of three of it typed here — which is why a
    // force-refresh never touched cerebras, cloudflare, ollama, openrouter,
    // cohere or llmgateway. Unkeyed and disabled providers are skipped below.
    const providers = PROVIDER_IDS;
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
//
// Q49: gated on `ai:usage`, which until 2026-09-06 was an enum value no route
// claimed and no mint granted — a permission that means nothing is worse than
// no permission at all, because it reads on the key-creation screen as though
// it were doing something. Gating it and adding it to the default mint set are
// one change: gating alone would have locked every existing key out of a route
// it could reach yesterday, and adding alone would have granted a word.
//
// Nothing in the suite calls either /usage route over HTTP — the AIGeek
// console reads usage through the in-process GraphQL `aiUsage` query — so the
// two keys minted before today (storygeek, fitnessgeek) losing a route they
// never called is the whole blast radius. Regenerating a key does not change
// its permissions; an existing key that wants this needs it added.
router.get('/usage/:provider/:modelId', async (req, res) => {
  try {
    const permissionError = requirePermission(req, res, 'ai:usage');
    if (permissionError) return;

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
// Q49 (2026-09-06) closed the follow-up this comment used to file: the route
// is gated on `ai:usage`, and `ai:usage` is now in the default mint set. See
// the sibling route above for why those two halves had to ship together.
router.get('/usage/:provider', async (req, res) => {
  try {
    const permissionError = requirePermission(req, res, 'ai:usage');
    if (permissionError) return;

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
// counters blinds `/stats` and the AIGeek console for everyone at once.
// (`/provider-health` was the third blinded reader; it went with the second
// routing stack, 2026-09-07.)
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

    // config/aiProviders.js's keyHintFor is the one definition of how much of
    // a provider credential may leave this process. A leading 8 characters is
    // the provider prefix plus real key material.
    req.log.info({ provider, keyHint: keyHintFor(providerConfig.apiKey) }, '[AI Test] API key found, making test call');

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


