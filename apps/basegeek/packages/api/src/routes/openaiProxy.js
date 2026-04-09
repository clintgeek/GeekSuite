import express from 'express';
import crypto from 'crypto';
import { authenticateAPIKey } from '../middleware/apiKeyAuth.js';
import aiService from '../services/aiService.js';
import AIModel from '../models/AIModel.js';
import { countMessageTokens, countTextTokens } from '../services/tokenCounter.js';
import { formatResponse } from '../utils/responseFormatter.js';

const router = express.Router();
const ROTATION_MODEL_ALIAS = 'basegeek-rotation';
const FREE_MODEL_ALIAS = 'basegeek-free';

function extractModeFromMessages(messages) {
  if (!Array.isArray(messages)) return null;

  for (const message of messages) {
    const { content } = message || {};
    let text = '';

    if (typeof content === 'string') {
      text = content;
    } else if (Array.isArray(content)) {
      text = content.map(part => {
        if (typeof part === 'string') return part;
        if (part?.text) return part.text;
        if (part?.type === 'text' && part?.value) return part.value;
        return '';
      }).join('\n');
    } else if (content && typeof content === 'object') {
      text = content.text || content.value || '';
    }

    if (!text) continue;

    const match = text.match(/Current Mode\s*[:\-]?\s*([A-Z ]+)/i);
    if (match) {
      const normalized = match[1].trim().toLowerCase().replace(/\s+/g, '-');
      if (normalized) {
        return normalized;
      }
    }
  }

  return null;
}

// OpenAI-compatible error helper
function openAIError(res, status, message, type = 'invalid_request_error', code = null) {
  return res.status(status).json({
    error: { message, type, ...(code && { code }) }
  });
}

// Wrap auth middleware to return OpenAI-compatible errors
const openaiAuth = (req, res, next) => {
  const middleware = authenticateAPIKey('ai:call');
  // Intercept the response to reformat errors
  const originalJson = res.json.bind(res);
  const originalStatus = res.status.bind(res);
  let capturedStatus = 200;

  res.status = (code) => {
    capturedStatus = code;
    return originalStatus(code);
  };

  res.json = (body) => {
    // If auth middleware is returning an error, reformat to OpenAI spec
    if (capturedStatus >= 400 && body?.success === false && body?.error) {
      return originalJson({
        error: {
          message: body.error.message,
          type: capturedStatus === 401 ? 'authentication_error'
            : capturedStatus === 429 ? 'rate_limit_error'
            : capturedStatus === 403 ? 'permission_error'
            : 'api_error',
          code: body.error.code || null
        }
      });
    }
    return originalJson(body);
  };

  middleware(req, res, next);
};

// All OpenAI-compatible requests must use a baseGeek API key with ai:call permission
router.use(openaiAuth);

// GET /v1/models — OpenAI-compatible models list
router.get('/models', async (req, res) => {
  try {
    const allProviders = Object.keys(aiService.providers).filter(p =>
      aiService.providers[p]?.apiKey && aiService.providers[p]?.enabled !== false
    );
    const allModels = [];

    for (const provider of allProviders) {
      const models = await aiService.getModels(provider);
      models.forEach(model => {
        allModels.push({
          id: model.id,
          object: 'model',
          created: Math.floor(Date.now() / 1000),
          owned_by: provider
        });
      });
    }

    // Add our virtual model aliases
    allModels.unshift(
      { id: ROTATION_MODEL_ALIAS, object: 'model', created: Math.floor(Date.now() / 1000), owned_by: 'basegeek' },
      { id: FREE_MODEL_ALIAS, object: 'model', created: Math.floor(Date.now() / 1000), owned_by: 'basegeek' }
    );

    res.json({ object: 'list', data: allModels });
  } catch (error) {
    console.error('[OpenAI Proxy] Models list error:', error);
    openAIError(res, 500, 'Failed to list models', 'server_error', 'models_list_error');
  }
});

// GET /v1/models/:model — Single model lookup
router.get('/models/:modelId', async (req, res) => {
  try {
    const { modelId } = req.params;

    // Check virtual aliases
    if (modelId === ROTATION_MODEL_ALIAS || modelId === FREE_MODEL_ALIAS) {
      return res.json({
        id: modelId,
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: 'basegeek'
      });
    }

    // Search across providers
    const allProviders = Object.keys(aiService.providers);
    for (const provider of allProviders) {
      const models = await aiService.getModels(provider);
      const found = models.find(m => m.id === modelId);
      if (found) {
        return res.json({
          id: found.id,
          object: 'model',
          created: Math.floor(Date.now() / 1000),
          owned_by: provider
        });
      }
    }

    openAIError(res, 404, `Model '${modelId}' not found`, 'invalid_request_error', 'model_not_found');
  } catch (error) {
    openAIError(res, 500, 'Failed to retrieve model', 'server_error');
  }
});

// POST /v1/chat/completions — Main chat endpoint
router.post('/chat/completions', async (req, res) => {
  try {
    const {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream = false,
      top_p: topP,
      user: userId,
      // Pass-through params for providers that support them
      stop,
      presence_penalty: presencePenalty,
      frequency_penalty: frequencyPenalty,
      response_format: responseFormat,
      n,
      seed
    } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return openAIError(res, 400, 'The request must include a non-empty messages array.', 'invalid_request_error', 'missing_messages');
    }

    // Validate n — we only support n=1
    if (n && n !== 1) {
      return openAIError(res, 400, 'Only n=1 is supported.', 'invalid_request_error', 'unsupported_parameter');
    }

    const lastUserMessage = [...messages].reverse().find(msg => msg.role === 'user');
    const promptForRouting = lastUserMessage?.content || JSON.stringify(messages);

    const requestedModel = typeof model === 'string' ? model : null;
    const useFreeAlias = requestedModel === FREE_MODEL_ALIAS;
    const useRotationAlias = !requestedModel || requestedModel === ROTATION_MODEL_ALIAS || useFreeAlias;

    const headerNamespace = req.get('x-cache-namespace');
    const bodyNamespace = typeof req.body?.cache_namespace === 'string' ? req.body.cache_namespace : null;
    const modeNamespace = typeof req.body?.mode === 'string' ? req.body.mode : null;
    const inferredMode = extractModeFromMessages(messages);

    let cacheNamespace = 'default';
    let namespaceSource = 'default';

    if (headerNamespace && headerNamespace.trim()) {
      cacheNamespace = headerNamespace.trim();
      namespaceSource = 'header';
    } else if (bodyNamespace && bodyNamespace.trim()) {
      cacheNamespace = bodyNamespace.trim();
      namespaceSource = 'body';
    } else if (modeNamespace && modeNamespace.trim()) {
      cacheNamespace = `mode:${modeNamespace.trim()}`;
      namespaceSource = 'mode';
    } else if (inferredMode) {
      cacheNamespace = `mode:${inferredMode}`;
      namespaceSource = 'inferred';
    }

    if (namespaceSource !== 'header' && namespaceSource !== 'body' && promptForRouting) {
      const promptString = typeof promptForRouting === 'string'
        ? promptForRouting
        : JSON.stringify(promptForRouting);
      const promptHash = crypto
        .createHash('md5')
        .update(promptString)
        .digest('hex')
        .slice(0, 12);
      cacheNamespace = `${cacheNamespace}|${promptHash}`;
    }

    const callConfig = {
      temperature,
      maxTokens,
      topP,
      messages,
      userId,
      autoRotate: !useFreeAlias,
      freeOnly: useFreeAlias,
      appName: req.apiKey?.appName || 'openai-proxy',
      cacheNamespace,
      // Pass through standard OpenAI params
      ...(stop !== undefined && { stop }),
      ...(presencePenalty !== undefined && { presencePenalty }),
      ...(frequencyPenalty !== undefined && { frequencyPenalty }),
      ...(responseFormat !== undefined && { responseFormat }),
      ...(seed !== undefined && { seed })
    };

    if (!useRotationAlias) {
      callConfig.model = requestedModel;
    }

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      try {
        const result = await aiService.callAI(promptForRouting, callConfig);
        const formatted = formatResponse(result);
        const created = Math.floor(Date.now() / 1000);
        const providerInfo = aiService.lastProviderInfo || {};
        const responseModel = useRotationAlias
          ? (useFreeAlias ? FREE_MODEL_ALIAS : ROTATION_MODEL_ALIAS)
          : providerInfo.model || requestedModel || providerInfo.provider || 'unknown';

        const id = `chatcmpl-${Date.now()}`;

        // Stream content in chunks
        const chunkSize = 50;
        for (let i = 0; i < formatted.length; i += chunkSize) {
          const content = formatted.slice(i, i + chunkSize);
          res.write(`data: ${JSON.stringify({
            id,
            object: 'chat.completion.chunk',
            created,
            model: responseModel,
            choices: [{ index: 0, delta: { content }, finish_reason: null }]
          })}\n\n`);
        }

        // Final chunk
        res.write(`data: ${JSON.stringify({
          id,
          object: 'chat.completion.chunk',
          created,
          model: responseModel,
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }]
        })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      } catch (error) {
        console.error('[OpenAI Proxy] Streaming error:', error);
        res.write(`data: ${JSON.stringify({
          error: {
            message: error.message || 'Internal server error',
            type: 'server_error',
            code: 'stream_error'
          }
        })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      }
      return;
    }

    // Non-streaming response
    const result = await aiService.callAI(promptForRouting, callConfig);
    const formatted = formatResponse(result);
    const created = Math.floor(Date.now() / 1000);
    const providerInfo = aiService.lastProviderInfo || {};
    const responseModel = useRotationAlias
      ? (useFreeAlias ? FREE_MODEL_ALIAS : ROTATION_MODEL_ALIAS)
      : providerInfo.model || requestedModel || providerInfo.provider || 'unknown';

    const promptTokens = countMessageTokens(messages);
    const completionTokens = countTextTokens(formatted);

    res.json({
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created,
      model: responseModel,
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: formatted },
          finish_reason: 'stop'
        }
      ],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens
      }
    });
  } catch (error) {
    console.error('[OpenAI Proxy] Error:', error);
    openAIError(res, 500, error.message || 'Internal server error', 'server_error', 'ai_call_error');
  }
});

export default router;
