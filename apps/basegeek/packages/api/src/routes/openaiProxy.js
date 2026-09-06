import express from 'express';
import crypto from 'crypto';
import { authenticateAPIKey } from '../middleware/apiKeyAuth.js';
import { resolveCaller, logCaller } from '../services/callerIdentity.js';
import aiService from '../services/aiService.js';
import AIModel from '../models/AIModel.js';
import { countMessageTokens, countTextTokens } from '../services/tokenCounter.js';
import { resolveFailure } from '../services/aiFailureEnvelope.js';

const router = express.Router();
const ROTATION_MODEL_ALIAS = 'basegeek-rotation';
const FREE_MODEL_ALIAS = 'basegeek-free';
const APP_MODEL_ALIAS = 'basegeek-app';

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

/**
 * The assistant's text, exactly as the model produced it.
 *
 * FINDING F-01: this used to run through `utils/responseFormatter.formatResponse`,
 * which is a CodeGeek UI transform — it scans for `grep(...)`, `read_file(...)`
 * and 23 other bare function-call spellings, rewrites each into XML and
 * prepends invented prose. Nothing in the OpenAI contract permits a proxy to
 * rewrite a completion, and a coding assistant's answers are full of exactly
 * those substrings. Worse, it ran *after* the JSON repair pass, so a
 * `response_format` payload containing one inside a string value came back
 * unparseable — all at HTTP 200.
 *
 * CodeGeek still gets the transform where it belongs: on its own route
 * (`/api/ai/*` in routes/aiRoutes.js), or in the CodeGeek client. This surface
 * returns what the provider said.
 */
function assistantText(result) {
  if (typeof result === 'string') return result;
  if (result === null || result === undefined) return '';
  if (typeof result.content === 'string') return result.content;
  return String(result);
}

/** The three virtual model ids this proxy answers to, for error messages. */
const VIRTUAL_ALIASES = [ROTATION_MODEL_ALIAS, FREE_MODEL_ALIAS, APP_MODEL_ALIAS];

/**
 * True when `modelId` is an explicit `<provider>/<model>` pin.
 *
 * Mirrors the rule in aiService.callAI: only split when the prefix is a known
 * provider, so a model id that merely contains a slash
 * (`meta-llama/Llama-3.3-70B-Instruct-Turbo-Free`) is left whole.
 */
function isProviderPin(modelId) {
  if (typeof modelId !== 'string') return false;
  const slashIdx = modelId.indexOf('/');
  if (slashIdx <= 0 || slashIdx === modelId.length - 1) return false;
  return Object.prototype.hasOwnProperty.call(aiService.providers, modelId.slice(0, slashIdx));
}

/**
 * The provider that owns a model id, or null if nothing in the catalog claims
 * it. This is the same lookup `GET /v1/models/{id}` answers with, deliberately:
 * what the catalog lists is exactly what chat/completions accepts.
 */
async function findModelOwner(modelId) {
  for (const provider of Object.keys(aiService.providers)) {
    try {
      const models = await aiService.getModels(provider);
      if (Array.isArray(models) && models.some(m => m.id === modelId)) return provider;
    } catch {
      // A provider that cannot answer right now is not a reason to fail the
      // lookup — keep asking the rest.
    }
  }
  return null;
}

/**
 * Every model id `provider` lists in the catalog, or an empty array when the
 * catalog cannot answer for it right now.
 *
 * Empty means *unknown*, not *empty*: `getModels` reads the AIModel collection
 * and swallows its own failures, so a database blip or an unseeded provider
 * would otherwise turn every pin into a 404. A pin is refused only against a
 * catalog that actually listed something.
 */
async function providerCatalog(provider) {
  try {
    const models = await aiService.getModels(provider);
    return Array.isArray(models) ? models.map(m => m?.id).filter(Boolean) : [];
  } catch {
    return [];
  }
}

/**
 * The error envelope for an upstream failure — the proxy's own words, never
 * the provider's.
 *
 * FINDING F-23: `error.message` went straight into the response, and those are
 * built as `` `Anthropic API error (${status}): ${JSON.stringify(...)}` `` at
 * services/aiService.js:2440 and ten sibling sites, so an `ai:call` key holder
 * read the vendor's raw error body. The allowlist that replaced it now lives in
 * services/aiFailureEnvelope.js, because `/api/ai/call` and `/api/ai/parse-json`
 * need exactly the same vocabulary and a second copy of it is how one of the
 * two drifts back into leaking. This function is only the rendering half: the
 * OpenAI error shape.
 */
function failUpstream(req, res, error, context = {}) {
  const failure = resolveFailure(req, res, error, context, '[OpenAI Proxy] upstream failure');
  return openAIError(res, failure.status, failure.message, failure.type, failure.code);
}

/**
 * baseGeek's own metadata about how a completion was answered.
 *
 * FINDING F-20: README_OPENAI_PROXY.md has always documented a `provider` key
 * on the response and "the final event includes provider metadata" on the
 * stream. Neither was ever emitted. It is worth emitting — behind rotation,
 * *which* backend answered is the one thing a caller cannot work out for
 * itself, and it is what makes a rotation debuggable from the outside.
 *
 * It ships under `x_geeksuite` rather than a bare `provider` key, because the
 * OpenAI response schema has no `provider` field and a strict client that
 * validates against the spec is entitled to reject an unknown one. The
 * `x_`-prefixed namespace is unmistakably an extension, and every SDK ignores
 * keys it does not recognise.
 */
function geekSuiteMeta(providerInfo = {}, caller = null) {
  return {
    provider: providerInfo.provider ?? null,
    model: providerInfo.model ?? null,
    cached: providerInfo.cached ?? false,
    app: caller?.appId ?? null,
    feature: caller?.feature ?? null
  };
}

/**
 * The OpenAI error envelope.
 *
 * FINDING F-12: spec, components.schemas.Error — `required: [type, message,
 * param, code]`. Both `param` and `code` are nullable but *required to be
 * present*. This helper never emitted `param` at all and dropped `code`
 * entirely when it was null, so the Python SDK's BadRequestError had no
 * `.param` to read and `instructor`, which surfaces `param` in its retry
 * prompts, had nothing to say. Both keys are emitted now, null when there is
 * nothing to name.
 */
function openAIError(res, status, message, type = 'invalid_request_error', code = null, param = null) {
  return res.status(status).json({
    error: { message, type, param, code }
  });
}

/**
 * Seconds a rate-limited caller should wait, from the reason the key gate gave.
 *
 * FINDING F-15: a 429 with no `Retry-After` disables the automatic retry in
 * every official OpenAI SDK — they read the header and, finding none, give the
 * error straight to the caller. The key gate's three buckets (minute, hour,
 * day) each imply a different wait, so the header says which one was hit
 * rather than guessing a flat minute for all of them.
 */
function retryAfterSecondsFor(reason = '') {
  const text = String(reason).toLowerCase();
  if (text.includes('per day')) {
    // The daily counter resets on a date change in the server's local zone
    // (models/APIKey.js checkRateLimit compares toDateString()).
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);
    return Math.max(1, Math.ceil((midnight.getTime() - Date.now()) / 1000));
  }
  if (text.includes('per hour')) {
    const nextHour = new Date();
    nextHour.setMinutes(60, 0, 0);
    return Math.max(1, Math.ceil((nextHour.getTime() - Date.now()) / 1000));
  }
  const nextMinute = new Date();
  nextMinute.setSeconds(60, 0);
  return Math.max(1, Math.ceil((nextMinute.getTime() - Date.now()) / 1000));
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
      // FINDING F-13: a bad key used to come back as
      // {type:"authentication_error", code:"INVALID_API_KEY"} — baseGeek's own
      // vocabulary, in SCREAMING_CASE. OpenAI answers a bad key with
      // {type:"invalid_request_error", code:"invalid_api_key"}, and client
      // code branching on either of those missed both.
      let type;
      let code;
      if (capturedStatus === 401) {
        type = 'invalid_request_error';
        code = 'invalid_api_key';
      } else if (capturedStatus === 429) {
        type = 'rate_limit_error';
        code = 'rate_limit_exceeded';
        res.setHeader('Retry-After', String(retryAfterSecondsFor(body.error.message)));
      } else if (capturedStatus === 403) {
        type = 'permission_error';
        code = body.error.code || 'insufficient_permissions';
      } else {
        type = 'api_error';
        code = body.error.code || null;
      }

      return originalJson({
        error: {
          message: body.error.message,
          type,
          // spec: Error.required = [type, message, param, code]. Both keys are
          // always present, null rather than absent when there is nothing to
          // say — see openAIError (F-12).
          param: null,
          code
        }
      });
    }
    return originalJson(body);
  };

  middleware(req, res, next);
};

/**
 * The headers an OpenAI client actually sends, for the preflight answer.
 * A browser only offers `Access-Control-Request-Headers` on the preflight, so
 * this list is the fallback for a client that asks for nothing specific.
 */
const CORS_ALLOWED_HEADERS = [
  'Authorization', 'Content-Type', 'x-api-key',
  'OpenAI-Organization', 'OpenAI-Project', 'OpenAI-Beta',
  'x-request-id', 'x-cache-namespace',
  'X-Stainless-Lang', 'X-Stainless-Package-Version', 'X-Stainless-OS',
  'X-Stainless-Arch', 'X-Stainless-Runtime', 'X-Stainless-Runtime-Version'
].join(', ');

/**
 * CORS and request-id echo, ahead of the key gate.
 *
 * FINDING F-17: the key gate is mounted with `router.use`, which runs on
 * `OPTIONS` too — so a preflight was answered with a 401. In production the
 * global `cors()` in server.js short-circuits preflights from the eight
 * allowlisted suite origins before the router ever sees them, which hid this;
 * a browser client from any other origin could not use the endpoint at all.
 * Relying on that global also made the router's correctness depend on where it
 * happens to be mounted. It answers its own preflight now.
 *
 * No `Access-Control-Allow-Credentials`: this endpoint authenticates by API-key
 * header, never by cookie, so a credentialed cross-origin request is neither
 * needed nor invited. (Worth saying plainly: calling this from a browser at all
 * means a `bg_` key is in client-side code. The CORS answer is here so a proxy
 * or an extension can work, not as an endorsement of shipping keys to a page.)
 *
 * The request-id echo is here for the same reason as the preflight — so the
 * router holds up its end of the contract wherever it is mounted, rather than
 * inheriting it from server.js. It defers to an id already set upstream.
 */
router.use((req, res, next) => {
  const origin = req.get('Origin');
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.vary('Origin');
  }
  res.setHeader('Access-Control-Expose-Headers', 'X-Request-Id, Retry-After');

  const callerRequestId = req.get('x-request-id');
  if (callerRequestId && !res.getHeader('X-Request-Id')) {
    res.setHeader('X-Request-Id', callerRequestId);
  }

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers',
      req.get('Access-Control-Request-Headers') || CORS_ALLOWED_HEADERS);
    res.setHeader('Access-Control-Max-Age', '600');
    return res.status(204).end();
  }

  return next();
});

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
    const now = Math.floor(Date.now() / 1000);
    allModels.unshift(
      { id: ROTATION_MODEL_ALIAS, object: 'model', created: now, owned_by: 'basegeek' },
      { id: FREE_MODEL_ALIAS, object: 'model', created: now, owned_by: 'basegeek' },
      { id: APP_MODEL_ALIAS, object: 'model', created: now, owned_by: 'basegeek' }
    );

    res.json({ object: 'list', data: allModels });
  } catch (error) {
    req.log.error({ err: error }, '[OpenAI Proxy] Models list error');
    openAIError(res, 500, 'Failed to list models', 'server_error', 'models_list_error');
  }
});

// GET /v1/models/:model — Single model lookup
router.get('/models/:modelId', async (req, res) => {
  try {
    const { modelId } = req.params;

    // Check virtual aliases
    if (modelId === ROTATION_MODEL_ALIAS || modelId === FREE_MODEL_ALIAS || modelId === APP_MODEL_ALIAS) {
      return res.json({
        id: modelId,
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: 'basegeek'
      });
    }

    // Search across providers
    const owner = await findModelOwner(modelId);
    if (owner) {
      return res.json({
        id: modelId,
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: owner
      });
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
      max_tokens: legacyMaxTokens,
      // FINDING F-10: `max_tokens` is deprecated in the spec in favour of
      // `max_completion_tokens`, which current SDK versions and every
      // reasoning-model caller send. The proxy read only the old name, so the
      // cap was silently whatever the provider defaults to.
      max_completion_tokens: maxCompletionTokens,
      stream = false,
      stream_options: streamOptions,
      top_p: topP,
      // `user` is deliberately NOT destructured here — resolveCaller reads it
      // from the body itself, through normalizeUserId's 64-character cap.
      // Pass-through params for providers that support them
      stop,
      presence_penalty: presencePenalty,
      frequency_penalty: frequencyPenalty,
      response_format: responseFormat,
      tools,
      tool_choice: toolChoice,
      n,
      seed
    } = req.body || {};

    // The key is the only auth on this router, so it is also the only thing
    // that says which app is calling. OpenAI's `user` field is honoured as the
    // per-user attribution it was designed to be, via resolveCaller.
    // Either spelling caps the completion; the newer one wins when a client
    // sends both (which the OpenAI SDK does not, but a hand-rolled one might).
    const maxTokens = maxCompletionTokens ?? legacyMaxTokens;

    const caller = resolveCaller(req, req.body || {});
    logCaller(req, caller, '[OpenAI Proxy] caller');
    // `resolveCaller` ALREADY reads the body's `user` — through
    // `normalizeUserId`, which caps it at 64 characters precisely because the
    // value lands in `AIUsage.userId` and is what the free-tier quota groups
    // on. Falling back to the raw `bodyUserId` re-admitted exactly the values
    // that cap had just rejected. The credential's answer is the answer.
    const userId = caller.userId;

    if (tools !== undefined && !Array.isArray(tools)) {
      return openAIError(res, 400, 'tools must be an array when provided.', 'invalid_request_error', 'invalid_tools', 'tools');
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return openAIError(res, 400, 'The request must include a non-empty messages array.', 'invalid_request_error', 'missing_messages', 'messages');
    }

    // Validate n — we only support n=1
    if (n && n !== 1) {
      return openAIError(res, 400, 'Only n=1 is supported.', 'invalid_request_error', 'unsupported_parameter', 'n');
    }

    const lastUserMessage = [...messages].reverse().find(msg => msg.role === 'user');
    const promptForRouting = lastUserMessage?.content || JSON.stringify(messages);

    const requestedModel = typeof model === 'string' ? model : null;
    const useFreeAlias = requestedModel === FREE_MODEL_ALIAS;
    const useAppAlias = requestedModel === APP_MODEL_ALIAS;
    const useRotationAlias = !requestedModel || requestedModel === ROTATION_MODEL_ALIAS || useFreeAlias || useAppAlias;

    // FINDING F-16: a model id the proxy does not recognise used to be treated
    // as an explicit pin and handed to whichever provider happened to be
    // current — so `gpt-4o-mini`, which LangChain's ChatOpenAI, Continue and
    // every curl example copied from OpenAI's docs default to, came back as a
    // generic 500 with no hint of what was wrong.
    //
    // The decision (2026-09-05) is (a): say so, in the contract's own words.
    // An id that is neither a virtual alias, nor a `<provider>/<model>` pin,
    // nor anything in the catalog is a 404 model_not_found naming the aliases,
    // which is what an SDK's NotFoundError is for. Silent rotation would make
    // the "drop-in replacement" claim literally true at the cost of answering
    // a question the caller did not ask.
    //
    // FINDING F-22: the check above exempted the pinned `<provider>/<model>`
    // form entirely, and a pin is not self-validating — `anthropic/gpt-4o-mini`
    // named a real provider and a model it has never served. callAI split the
    // pin, watched anthropic reject the id, and walked its fallback list, where
    // every other provider is called with *its own* default model. The caller
    // got a 200, a completion from a model it never named, and the bill.
    //
    // A named model is now a promise: the pin is checked against that
    // provider's catalog, and a request that names a concrete model — pinned
    // or bare — is answered by that model or not at all (`noFallback` below).
    // The three `basegeek-*` aliases are the opposite promise and keep every
    // bit of their rotation.
    let ownerProvider = null;
    if (!useRotationAlias) {
      if (isProviderPin(requestedModel)) {
        const slashIdx = requestedModel.indexOf('/');
        ownerProvider = requestedModel.slice(0, slashIdx);
        const pinnedModelId = requestedModel.slice(slashIdx + 1);
        const catalog = await providerCatalog(ownerProvider);
        if (catalog.length > 0 && !catalog.includes(pinnedModelId)) {
          return openAIError(
            res,
            404,
            `The model '${pinnedModelId}' does not exist on provider ` +
            `'${ownerProvider}'. Pin a model that provider actually serves, ` +
            `use one of the routing aliases (${VIRTUAL_ALIASES.join(', ')}), ` +
            `or name a model from GET /openai/v1/models.`,
            'invalid_request_error',
            'model_not_found',
            'model'
          );
        }
      } else {
        const owner = await findModelOwner(requestedModel);
        if (!owner) {
          return openAIError(
            res,
            404,
            `The model '${requestedModel}' does not exist. This is baseGeek's ` +
            `OpenAI-compatible endpoint, not OpenAI — it serves its own catalog. ` +
            `Use one of the routing aliases (${VIRTUAL_ALIASES.join(', ')}), ` +
            `pin a backend with '<provider>/<model>' (e.g. ` +
            `'anthropic/claude-3-5-sonnet-20241022'), or name a model from ` +
            `GET /openai/v1/models.`,
            'invalid_request_error',
            'model_not_found',
            'model'
          );
        }
        ownerProvider = owner;
      }
    }

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
      messages,
      userId,
      autoRotate: !useFreeAlias && !useAppAlias,
      freeOnly: useFreeAlias,
      useAppConfig: useAppAlias,
      appName: caller.appId,
      feature: caller.feature,
      cacheNamespace,
      // Pass through standard OpenAI params. Each of these now survives all
      // the way to a provider adapter (F-09) rather than dying one function
      // call downstream.
      ...(topP !== undefined && { topP }),
      ...(stop !== undefined && { stop }),
      ...(presencePenalty !== undefined && { presencePenalty }),
      ...(frequencyPenalty !== undefined && { frequencyPenalty }),
      ...(responseFormat !== undefined && { responseFormat }),
      ...(tools !== undefined && { tools }),
      ...(toolChoice !== undefined && { toolChoice }),
      ...(seed !== undefined && { seed })
    };

    if (!useRotationAlias) {
      callConfig.model = requestedModel;
      // The provider that owns the id, so a bare catalog id reaches its own
      // backend rather than whichever provider happens to be current...
      callConfig.provider = ownerProvider;
      // ...and no other backend gets to answer in its place (F-22). Without
      // this, a pin whose provider is merely rate-limited is served by the
      // next provider's default model, at 200, under the pinned model's name.
      callConfig.noFallback = true;
    }

    // What goes back in the response's `model` field.
    //
    // FINDING F-18: `basegeek-app` used to echo `basegeek-rotation`, so a
    // client that logs or keys off the returned model saw a request it never
    // made. An alias echoes itself; a pin echoes whatever actually answered.
    const echoedModel = (providerInfo = {}) => (
      useRotationAlias
        ? (requestedModel || ROTATION_MODEL_ALIAS)
        : providerInfo.model || requestedModel || providerInfo.provider || 'unknown'
    );

    // ── Streaming ────────────────────────────────────────────────────────
    //
    // FINDING F-21, said out loud because the docs used to imply otherwise:
    // this is *simulated* streaming. The whole completion is awaited and then
    // re-chunked, so the frames are spec-shaped and any SSE client works, but
    // time-to-first-token equals time-to-last-token. Real token streaming
    // means a streaming adapter per provider, which is a separate job.
    //
    // FINDING F-07: the headers used to be committed *before* the await, so a
    // provider failure could only be reported as a 200 carrying an error frame
    // — which no SDK can classify as an error, because by then the status line
    // is spent. Since the completion is awaited whole anyway, nothing is lost
    // by awaiting first: an upstream failure is an ordinary HTTP error status
    // with the ordinary envelope, exactly as the non-streaming path reports it.
    // The terminal-error-frame path survives below for the genuinely
    // unreachable case where something throws after the first byte.
    if (stream) {
      let result;
      try {
        result = await aiService.callAI(promptForRouting, callConfig);
      } catch (error) {
        // F-23: the same envelope the non-streaming path returns, from the
        // same allowlist — nothing the provider said reaches the caller.
        return failUpstream(req, res, error, { stage: 'stream_before_first_chunk', model: requestedModel });
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      // Nginx and friends buffer proxied responses by default, which turns an
      // event stream back into one big response.
      res.setHeader('X-Accel-Buffering', 'no');

      try {
        const formatted = assistantText(result);
        const created = Math.floor(Date.now() / 1000);
        const providerInfo = aiService.lastProviderInfo || {};
        const responseModel = echoedModel(providerInfo);

        const id = `chatcmpl-${Date.now()}`;
        const hasToolCalls = Array.isArray(providerInfo.toolCalls) && providerInfo.toolCalls.length > 0;
        const structured = !!responseFormat || hasToolCalls;
        const finalFinishReason = hasToolCalls
          ? 'tool_calls'
          : (providerInfo.finishReason || 'stop');

        const frame = (choices, extra = {}) => {
          res.write(`data: ${JSON.stringify({
            id,
            object: 'chat.completion.chunk',
            created,
            model: responseModel,
            choices,
            ...extra
          })}\n\n`);
        };

        // FINDING F-05: the documented first chunk is
        // {"delta":{"role":"assistant","content":""}}. Clients that assemble
        // the message from deltas — LangChain's stream handler, the Vercel AI
        // SDK, the Python SDK's ChatCompletionStreamState — key off that role,
        // and it was never emitted. It leads every stream now, including the
        // tool-call and structured ones, so there is one shape to reason about.
        frame([{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }]);

        if (hasToolCalls) {
          // Tool-call response: a single chunk with the full tool_calls array.
          // Arbitrary char-boundary fragmentation would break JSON parsing on
          // the client, so we emit the whole structure atomically.
          //
          // FINDING F-08: each entry carries `index`. That is what lets a
          // client reassemble fragments into the right call, and it is what
          // the OpenAI SDK's stream accumulator keys on — without it, a
          // delta-accumulating client either drops the call or merges two.
          frame([{
            index: 0,
            delta: {
              tool_calls: providerInfo.toolCalls.map((tc, i) => ({ index: i, ...tc }))
            },
            finish_reason: null
          }]);
        } else if (structured) {
          // response_format active: emit full content as one chunk so the
          // resulting JSON is always parseable by the client as a whole.
          frame([{ index: 0, delta: { content: formatted }, finish_reason: null }]);
        } else {
          // Plain text: chunk at 50 chars for responsive streaming UX.
          const chunkSize = 50;
          for (let i = 0; i < formatted.length; i += chunkSize) {
            frame([{ index: 0, delta: { content: formatted.slice(i, i + chunkSize) }, finish_reason: null }]);
          }
        }

        // Final chunk — and the one place the stream can say which backend
        // answered (F-20), which is what the docs have always promised.
        frame([{ index: 0, delta: {}, finish_reason: finalFinishReason }],
          { x_geeksuite: geekSuiteMeta(providerInfo, caller) });

        // FINDING F-06. spec, ChatCompletionStreamOptions.include_usage: "an
        // additional chunk will be streamed before the `data: [DONE]` message.
        // The `usage` field on this chunk shows the token usage statistics for
        // the entire request, and the `choices` field will always be an empty
        // array." Every usage meter built on a streaming client reads this;
        // without it a streamed call is invisible to the caller's accounting.
        if (streamOptions?.include_usage) {
          const promptTokens = countMessageTokens(messages);
          const completionTokens = countTextTokens(formatted);
          frame([], {
            usage: {
              prompt_tokens: promptTokens,
              completion_tokens: completionTokens,
              total_tokens: promptTokens + completionTokens
            }
          });
        }

        res.write('data: [DONE]\n\n');
        res.end();
      } catch (error) {
        // Past the first byte the status line is already spent, so a terminal
        // error frame is all the contract leaves us. Reaching here means a
        // serialization bug, not a provider failure — those were caught above.
        req.log.error({ err: error }, '[OpenAI Proxy] Streaming error after first chunk');
        res.write(`data: ${JSON.stringify({
          error: {
            // F-23: opaque here too. Reaching this point means a bug in the
            // framing above, and the detail is in the log line just written.
            message: 'The request could not be completed.',
            type: 'server_error',
            param: null,
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
    const formatted = assistantText(result);
    const created = Math.floor(Date.now() / 1000);
    const providerInfo = aiService.lastProviderInfo || {};
    const responseModel = echoedModel(providerInfo);

    const promptTokens = countMessageTokens(messages);
    const completionTokens = countTextTokens(formatted);

    // Surface OpenAI-style tool_calls when the provider returned them.
    // Anthropic/Gemini emit tool_use/functionCall blocks; the call*() methods
    // normalize them onto lastProviderInfo.toolCalls.
    const assistantMessage = { role: 'assistant', content: formatted };
    let finishReason = 'stop';
    if (Array.isArray(providerInfo.toolCalls) && providerInfo.toolCalls.length > 0) {
      let emitted = providerInfo.toolCalls;
      // Defense-in-depth for single-response-model clients (Instructor, etc.):
      // when the caller pinned a specific tool via tool_choice:{type:"function"},
      // the OpenAI contract is exactly one tool_call out. If multiple slipped
      // through (e.g. a provider ignored disable_parallel_tool_use), collapse
      // to the first matching call here so downstream clients don't break.
      const forcedName = toolChoice && typeof toolChoice === 'object'
        && toolChoice.type === 'function' && toolChoice.function?.name;
      if (forcedName && emitted.length > 1) {
        req.log.warn({ count: emitted.length, forcedName },
          '[OpenAI Proxy] Collapsing multi tool_calls to forced function');
        const match = emitted.find(tc => tc?.function?.name === forcedName) || emitted[0];
        emitted = [match];
      }
      assistantMessage.tool_calls = emitted;
      assistantMessage.content = formatted || null;
      finishReason = 'tool_calls';
    } else if (providerInfo.finishReason) {
      finishReason = providerInfo.finishReason;
    }

    res.json({
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created,
      model: responseModel,
      choices: [
        {
          index: 0,
          message: assistantMessage,
          // FINDING F-11: spec,
          // CreateChatCompletionResponse.choices[].required includes
          // `logprobs`. Nullable, but required to be present — a strict
          // response validator (and Go's typed decoder) rejects a choice
          // without it. We compute no logprobs, so: null.
          logprobs: null,
          finish_reason: finishReason
        }
      ],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens
      },
      x_geeksuite: geekSuiteMeta(providerInfo, caller)
    });
  } catch (error) {
    // F-23: every failure that gets this far — a provider's 4xx/5xx, an
    // exhausted rotation, a timeout, or a bug in this file — is answered from
    // the allowlist in UPSTREAM_FAILURES and logged in full server-side.
    failUpstream(req, res, error, { stage: 'chat_completions', model: req.body?.model ?? null });
  }
});

export default router;
