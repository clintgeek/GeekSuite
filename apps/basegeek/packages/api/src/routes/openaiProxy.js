import express from 'express';
import crypto from 'crypto';
import { authenticateAPIKey } from '../middleware/apiKeyAuth.js';
import aiService from '../services/aiService.js';
import { countMessageTokens, countTextTokens } from '../services/tokenCounter.js';
import { formatResponse } from '../utils/responseFormatter.js';

const router = express.Router();
const ROTATION_MODEL_ALIAS = 'basegeek-rotation';

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

// All OpenAI-compatible requests must use a baseGeek API key with ai:call permission
router.use(authenticateAPIKey('ai:call'));

router.post('/chat/completions', async (req, res) => {
  try {
    const {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream = false,
      top_p: topP,
      user: userId
    } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        error: {
          message: 'The request must include a non-empty messages array.',
          type: 'invalid_request_error'
        }
      });
    }

    const lastUserMessage = [...messages].reverse().find(msg => msg.role === 'user');
    const promptForRouting = lastUserMessage?.content || JSON.stringify(messages);

    const requestedModel = typeof model === 'string' ? model : null;
    const useRotationAlias = !requestedModel || requestedModel === ROTATION_MODEL_ALIAS;

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

    console.log(`[OpenAI Proxy] Using cache namespace: ${cacheNamespace}`);

    const callConfig = {
      temperature,
      maxTokens,
      topP,
      messages,
      userId,
      autoRotate: true,
      appName: req.apiKey?.appName || 'openai-proxy',
      cacheNamespace
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
          ? ROTATION_MODEL_ALIAS
          : providerInfo.model || requestedModel || providerInfo.provider || 'unknown';

        const chunkPayload = {
          id: `chatcmpl-${Date.now()}`,
          object: 'chat.completion.chunk',
          created,
          model: responseModel,
          choices: [
            {
              index: 0,
              delta: { content: formatted },
              finish_reason: null
            }
          ]
        };

        res.write(`data: ${JSON.stringify(chunkPayload)}\n\n`);

        const finalPayload = {
          ...chunkPayload,
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: 'stop'
            }
          ],
          provider: providerInfo
        };

        res.write(`data: ${JSON.stringify(finalPayload)}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      } catch (error) {
        console.error('[OpenAI Proxy] Streaming error:', error);
        res.write(`data: ${JSON.stringify({ error: { message: error.message } })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      }
      return;
    }

    const result = await aiService.callAI(promptForRouting, callConfig);
    const formatted = formatResponse(result);
    const created = Math.floor(Date.now() / 1000);
    const providerInfo = aiService.lastProviderInfo || {};
    const responseModel = useRotationAlias
      ? ROTATION_MODEL_ALIAS
      : providerInfo.model || requestedModel || providerInfo.provider || 'unknown';

    const promptTokens = countMessageTokens(messages);
    const completionTokens = countTextTokens(formatted);

    const responsePayload = {
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created,
      model: responseModel,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: formatted
          },
          finish_reason: 'stop'
        }
      ],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens
      },
      provider: providerInfo
    };

    res.json(responsePayload);
  } catch (error) {
    console.error('[OpenAI Proxy] Error:', error);
    res.status(500).json({
      error: {
        message: error.message || 'Internal server error',
        type: 'internal_error'
      }
    });
  }
});

export default router;
