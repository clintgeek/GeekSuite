import AIModel from '../models/AIModel.js';
import logger from '../lib/logger.js';

// Canonical OpenAI-compatible capability flags layered on top of the legacy
// (supportsFunctionCalling / supportsJSONOutput) flags. Populated by normalize()
// so every entry in knownCapabilities gets the full set without per-entry edits.
//
// JSON_SCHEMA_SUPPORTED / JSON_MODE_SUPPORTED:
//   Provider/model pairs where aiService has a NATIVE translation implemented
//   in its call*() method for response_format:{type: "json_schema"|"json_object"}.
//
// Pairs NOT in these sets fall through to the prompt-injection fallback
// (item 5) — which preserves rotation: every provider can "do" structured
// output one way or the other, just at varying fidelity.
//
// Expand these sets as native implementations land in callGroq / callCerebras /
// callOpenRouter / etc. The legacy supportsJSONOutput flag is a softer "can
// produce JSON when asked" signal used elsewhere (aiDirectorService model
// selection); these are the stricter "we forward response_format correctly"
// signals.
const JSON_SCHEMA_SUPPORTED = new Set([
  'anthropic:*',
  'gemini:*'
]);
const JSON_MODE_SUPPORTED = new Set([
  'anthropic:*',
  'gemini:*'
]);

// TOOL_FORWARDING_PROVIDERS: the providers whose adapter in aiService actually
// puts `tools` on the wire and reads `tool_calls` back off it.
//
// FINDING F-04: this set is the difference between a capability matrix and a
// wish. `supportsToolCalling` gates the rotation (aiService.js — a `tools`
// request skips any provider the matrix calls incapable), so a provider marked
// capable with no adapter behind it does not fail loudly: it is *selected*, the
// `tools` array is quietly dropped at the adapter, and the caller gets prose and
// finish_reason "stop" where the contract promised tool_calls. Groq was marked
// capable on twelve models for exactly that reason, and both aiGeek docs said
// so; callGroq now forwards, so the claim is true.
//
// The rule: a provider goes in here the same day its call*() learns to forward
// `tools` — never before. Everything else falls out of the rotation for tool
// requests, which is the correct answer, because tool calling has no
// prompt-injection fallback the way structured output does: a tool_calls
// response shape can only come from native provider support.
const TOOL_FORWARDING_PROVIDERS = new Set([
  'anthropic',  // callClaude — tools + all four tool_choice forms + tool_use readback
  'gemini',     // callGemini — functionDeclarations + toolConfig + functionCall readback
  'groq'        // callGroq   — OpenAI-shaped tools/tool_choice, verbatim
]);

function forwardsTools(provider) {
  return TOOL_FORWARDING_PROVIDERS.has(provider);
}

// TOOL_CALLING_CORRECTIONS: overrides for supportsFunctionCalling/supportsToolCalling.
// The legacy data in knownCapabilities predates Groq's function-calling support — this
// set patches those entries without rewriting 50 blocks.
const TOOL_CALLING_CORRECTIONS = new Set([
  'groq:llama-3.3-70b-versatile',
  'groq:llama-3.1-70b-versatile',
  'groq:llama-3.1-8b-instant',
  'groq:llama3-70b-8192',
  'groq:llama3-8b-8192',
  'groq:meta-llama/llama-4-scout-17b-16e-instruct',
  'groq:meta-llama/llama-4-maverick-17b-128e-instruct',
  'groq:qwen/qwen3-32b',
  'groq:moonshotai/kimi-k2-instruct',
  'groq:openai/gpt-oss-20b',
  'groq:openai/gpt-oss-120b',
  'groq:deepseek-r1-distill-llama-70b'
]);

function schemaSupportedFor(provider, modelId) {
  return JSON_SCHEMA_SUPPORTED.has(`${provider}:*`) ||
         JSON_SCHEMA_SUPPORTED.has(`${provider}:${modelId}`);
}

function jsonModeSupportedFor(provider, modelId) {
  return JSON_MODE_SUPPORTED.has(`${provider}:*`) ||
         JSON_MODE_SUPPORTED.has(`${provider}:${modelId}`);
}

function toolCallingCorrectedFor(provider, modelId) {
  return TOOL_CALLING_CORRECTIONS.has(`${provider}:${modelId}`);
}

class AIModelCapabilitiesService {
  constructor() {
    // Known model capabilities based on provider documentation and AI knowledge
    this.knownCapabilities = {
      'anthropic': {
        'claude-3-5-sonnet-20241022': {
          maxTokens: 200000,
          supportsVision: false,
          supportsAudio: false,
          supportsFunctionCalling: true,
          supportsJSONOutput: true,
          supportsStreaming: true,
          contextWindow: 200000,
          tasks: {
            textGeneration: true,
            codeGeneration: true,
            reasoning: true,
            analysis: true,
            summarization: true,
            translation: true,
            questionAnswering: true,
            creativeWriting: true,
            structuredOutput: true
          },
          performance: {
            speed: 'fast',
            quality: 'excellent',
            reasoning: 'excellent'
          }
        },
        'claude-3-5-haiku-20241022': {
          maxTokens: 200000,
          supportsVision: false,
          supportsAudio: false,
          supportsFunctionCalling: true,
          supportsJSONOutput: true,
          supportsStreaming: true,
          contextWindow: 200000,
          tasks: {
            textGeneration: true,
            codeGeneration: true,
            reasoning: true,
            analysis: true,
            summarization: true,
            translation: true,
            questionAnswering: true,
            creativeWriting: true,
            structuredOutput: true
          },
          performance: {
            speed: 'ultra-fast',
            quality: 'good',
            reasoning: 'good'
          }
        },
        'claude-opus-4-1-20250805': {
          maxTokens: 200000,
          supportsVision: true,
          supportsAudio: false,
          supportsFunctionCalling: true,
          supportsJSONOutput: true,
          supportsStreaming: true,
          contextWindow: 200000,
          tasks: {
            textGeneration: true,
            codeGeneration: true,
            reasoning: true,
            analysis: true,
            summarization: true,
            translation: true,
            questionAnswering: true,
            creativeWriting: true,
            structuredOutput: true
          },
          performance: {
            speed: 'slow',
            quality: 'state-of-the-art',
            reasoning: 'state-of-the-art'
          }
        },
        'claude-opus-4-20250514': {
          maxTokens: 200000,
          supportsVision: true,
          supportsAudio: false,
          supportsFunctionCalling: true,
          supportsJSONOutput: true,
          supportsStreaming: true,
          contextWindow: 200000,
          tasks: {
            textGeneration: true,
            codeGeneration: true,
            reasoning: true,
            analysis: true,
            summarization: true,
            translation: true,
            questionAnswering: true,
            creativeWriting: true,
            structuredOutput: true
          },
          performance: {
            speed: 'slow',
            quality: 'state-of-the-art',
            reasoning: 'state-of-the-art'
          }
        },
        'claude-sonnet-4-20250514': {
          maxTokens: 200000,
          supportsVision: false,
          supportsAudio: false,
          supportsFunctionCalling: true,
          supportsJSONOutput: true,
          supportsStreaming: true,
          contextWindow: 200000,
          tasks: {
            textGeneration: true,
            codeGeneration: true,
            reasoning: true,
            analysis: true,
            summarization: true,
            translation: true,
            questionAnswering: true,
            creativeWriting: true,
            structuredOutput: true
          },
          performance: {
            speed: 'medium',
            quality: 'excellent',
            reasoning: 'excellent'
          }
        },
        'claude-3-7-sonnet-20250219': {
          maxTokens: 200000,
          supportsVision: false,
          supportsAudio: false,
          supportsFunctionCalling: true,
          supportsJSONOutput: true,
          supportsStreaming: true,
          contextWindow: 200000,
          tasks: {
            textGeneration: true,
            codeGeneration: true,
            reasoning: true,
            analysis: true,
            summarization: true,
            translation: true,
            questionAnswering: true,
            creativeWriting: true,
            structuredOutput: true
          },
          performance: {
            speed: 'medium',
            quality: 'excellent',
            reasoning: 'excellent'
          }
        },
        'claude-3-haiku-20240307': {
          maxTokens: 200000,
          supportsVision: false,
          supportsAudio: false,
          supportsFunctionCalling: true,
          supportsJSONOutput: true,
          supportsStreaming: true,
          contextWindow: 200000,
          tasks: {
            textGeneration: true,
            codeGeneration: true,
            reasoning: true,
            analysis: true,
            summarization: true,
            translation: true,
            questionAnswering: true,
            creativeWriting: true,
            structuredOutput: true
          },
          performance: {
            speed: 'ultra-fast',
            quality: 'good',
            reasoning: 'good'
          }
        }
      },
      'groq': {
        'llama-3.1-8b-instant': {
          maxTokens: 8192,
          supportsVision: false,
          supportsAudio: false,
          supportsFunctionCalling: false,
          supportsJSONOutput: true,
          supportsStreaming: true,
          contextWindow: 8192,
          tasks: {
            textGeneration: true,
            codeGeneration: true,
            reasoning: false,
            analysis: true,
            summarization: true,
            translation: true,
            questionAnswering: true,
            creativeWriting: true,
            structuredOutput: true
          },
          performance: {
            speed: 'ultra-fast',
            quality: 'good',
            reasoning: 'basic'
          }
        },
        'llama-3.1-70b-versatile': {
          maxTokens: 8192,
          supportsVision: false,
          supportsAudio: false,
          supportsFunctionCalling: false,
          supportsJSONOutput: true,
          supportsStreaming: true,
          contextWindow: 8192,
          tasks: {
            textGeneration: true,
            codeGeneration: true,
            reasoning: true,
            analysis: true,
            summarization: true,
            translation: true,
            questionAnswering: true,
            creativeWriting: true,
            structuredOutput: true
          },
          performance: {
            speed: 'fast',
            quality: 'excellent',
            reasoning: 'excellent'
          }
        },
        'llama-3.1-405b-reasoning': {
          maxTokens: 8192,
          supportsVision: false,
          supportsAudio: false,
          supportsFunctionCalling: false,
          supportsJSONOutput: true,
          supportsStreaming: true,
          contextWindow: 8192,
          tasks: {
            textGeneration: true,
            codeGeneration: true,
            reasoning: true,
            analysis: true,
            summarization: true,
            translation: true,
            questionAnswering: true,
            creativeWriting: true,
            structuredOutput: true
          },
          performance: {
            speed: 'medium',
            quality: 'excellent',
            reasoning: 'state-of-the-art'
          }
        },
        'mixtral-8x7b-instant': {
          maxTokens: 8192,
          supportsVision: false,
          supportsAudio: false,
          supportsFunctionCalling: false,
          supportsJSONOutput: true,
          supportsStreaming: true,
          contextWindow: 8192,
          tasks: {
            textGeneration: true,
            codeGeneration: true,
            reasoning: false,
            analysis: true,
            summarization: true,
            translation: true,
            questionAnswering: true,
            creativeWriting: true,
            structuredOutput: true
          },
          performance: {
            speed: 'ultra-fast',
            quality: 'good',
            reasoning: 'basic'
          }
        },
        'gemma-2-9b-it': {
          maxTokens: 8192,
          supportsVision: false,
          supportsAudio: false,
          supportsFunctionCalling: false,
          supportsJSONOutput: true,
          supportsStreaming: true,
          contextWindow: 8192,
          tasks: {
            textGeneration: true,
            codeGeneration: true,
            reasoning: false,
            analysis: true,
            summarization: true,
            translation: true,
            questionAnswering: true,
            creativeWriting: true,
            structuredOutput: true
          },
          performance: {
            speed: 'ultra-fast',
            quality: 'good',
            reasoning: 'basic'
          }
        },
        'llama-3.3-70b-versatile': {
          maxTokens: 8192,
          supportsVision: false,
          supportsAudio: false,
          supportsFunctionCalling: false,
          supportsJSONOutput: true,
          supportsStreaming: true,
          contextWindow: 8192,
          tasks: {
            textGeneration: true,
            codeGeneration: true,
            reasoning: true,
            analysis: true,
            summarization: true,
            translation: true,
            questionAnswering: true,
            creativeWriting: true,
            structuredOutput: true
          },
          performance: {
            speed: 'fast',
            quality: 'excellent',
            reasoning: 'excellent'
          }
        },
        'llama3-8b-8192': {
          maxTokens: 8192,
          supportsVision: false,
          supportsAudio: false,
          supportsFunctionCalling: false,
          supportsJSONOutput: true,
          supportsStreaming: true,
          contextWindow: 8192,
          tasks: {
            textGeneration: true,
            codeGeneration: true,
            reasoning: false,
            analysis: true,
            summarization: true,
            translation: true,
            questionAnswering: true,
            creativeWriting: true,
            structuredOutput: true
          },
          performance: {
            speed: 'ultra-fast',
            quality: 'good',
            reasoning: 'basic'
          }
        },
        'llama3-70b-8192': {
          maxTokens: 8192,
          supportsVision: false,
          supportsAudio: false,
          supportsFunctionCalling: false,
          supportsJSONOutput: true,
          supportsStreaming: true,
          contextWindow: 8192,
          tasks: {
            textGeneration: true,
            codeGeneration: true,
            reasoning: true,
            analysis: true,
            summarization: true,
            translation: true,
            questionAnswering: true,
            creativeWriting: true,
            structuredOutput: true
          },
          performance: {
            speed: 'fast',
            quality: 'excellent',
            reasoning: 'excellent'
          }
        },
        'gemma2-9b-it': {
          maxTokens: 8192,
          supportsVision: false,
          supportsAudio: false,
          supportsFunctionCalling: false,
          supportsJSONOutput: true,
          supportsStreaming: true,
          contextWindow: 8192,
          tasks: {
            textGeneration: true,
            codeGeneration: true,
            reasoning: false,
            analysis: true,
            summarization: true,
            translation: true,
            questionAnswering: true,
            creativeWriting: true,
            structuredOutput: true
          },
          performance: {
            speed: 'ultra-fast',
            quality: 'good',
            reasoning: 'basic'
          }
        },
        'compound-beta': {
          maxTokens: 8192,
          supportsVision: false,
          supportsAudio: false,
          supportsFunctionCalling: false,
          supportsJSONOutput: true,
          supportsStreaming: true,
          contextWindow: 8192,
          tasks: {
            textGeneration: true,
            codeGeneration: true,
            reasoning: false,
            analysis: true,
            summarization: true,
            translation: true,
            questionAnswering: true,
            creativeWriting: true,
            structuredOutput: true
          },
          performance: {
            speed: 'ultra-fast',
            quality: 'good',
            reasoning: 'basic'
          }
        },
        'compound-beta-mini': {
          maxTokens: 8192,
          supportsVision: false,
          supportsAudio: false,
          supportsFunctionCalling: false,
          supportsJSONOutput: true,
          supportsStreaming: true,
          contextWindow: 8192,
          tasks: {
            textGeneration: true,
            codeGeneration: true,
            reasoning: false,
            analysis: true,
            summarization: true,
            translation: true,
            questionAnswering: true,
            creativeWriting: true,
            structuredOutput: true
          },
          performance: {
            speed: 'ultra-fast',
            quality: 'good',
            reasoning: 'basic'
          }
        },
        'meta-llama/llama-4-scout-17b-16e-instruct': {
          maxTokens: 8192,
          supportsVision: false,
          supportsAudio: false,
          supportsFunctionCalling: false,
          supportsJSONOutput: true,
          supportsStreaming: true,
          contextWindow: 8192,
          tasks: {
            textGeneration: true,
            codeGeneration: true,
            reasoning: true,
            analysis: true,
            summarization: true,
            translation: true,
            questionAnswering: true,
            creativeWriting: true,
            structuredOutput: true
          },
          performance: {
            speed: 'fast',
            quality: 'excellent',
            reasoning: 'excellent'
          }
        },
        'meta-llama/llama-4-maverick-17b-128e-instruct': {
          maxTokens: 8192,
          supportsVision: false,
          supportsAudio: false,
          supportsFunctionCalling: false,
          supportsJSONOutput: true,
          supportsStreaming: true,
          contextWindow: 8192,
          tasks: {
            textGeneration: true,
            codeGeneration: true,
            reasoning: true,
            analysis: true,
            summarization: true,
            translation: true,
            questionAnswering: true,
            creativeWriting: true,
            structuredOutput: true
          },
          performance: {
            speed: 'fast',
            quality: 'excellent',
            reasoning: 'excellent'
          }
        },
        'meta-llama/llama-guard-4-12b': {
          maxTokens: 8192,
          supportsVision: false,
          supportsAudio: false,
          supportsFunctionCalling: false,
          supportsJSONOutput: true,
          supportsStreaming: true,
          contextWindow: 8192,
          tasks: {
            textGeneration: true,
            codeGeneration: false,
            reasoning: false,
            analysis: true,
            summarization: true,
            translation: false,
            questionAnswering: true,
            creativeWriting: false,
            structuredOutput: false
          },
          performance: {
            speed: 'fast',
            quality: 'good',
            reasoning: 'basic'
          }
        },
        'meta-llama/llama-prompt-guard-2-22m': {
          maxTokens: 8192,
          supportsVision: false,
          supportsAudio: false,
          supportsFunctionCalling: false,
          supportsJSONOutput: true,
          supportsStreaming: true,
          contextWindow: 8192,
          tasks: {
            textGeneration: true,
            codeGeneration: false,
            reasoning: false,
            analysis: true,
            summarization: true,
            translation: false,
            questionAnswering: true,
            creativeWriting: false,
            structuredOutput: false
          },
          performance: {
            speed: 'ultra-fast',
            quality: 'basic',
            reasoning: 'basic'
          }
        },
        'meta-llama/llama-prompt-guard-2-86m': {
          maxTokens: 8192,
          supportsVision: false,
          supportsAudio: false,
          supportsFunctionCalling: false,
          supportsJSONOutput: true,
          supportsStreaming: true,
          contextWindow: 8192,
          tasks: {
            textGeneration: true,
            codeGeneration: false,
            reasoning: false,
            analysis: true,
            summarization: true,
            translation: false,
            questionAnswering: true,
            creativeWriting: false,
            structuredOutput: false
          },
          performance: {
            speed: 'ultra-fast',
            quality: 'basic',
            reasoning: 'basic'
          }
        },
        'qwen/qwen3-32b': {
          maxTokens: 8192,
          supportsVision: false,
          supportsAudio: false,
          supportsFunctionCalling: false,
          supportsJSONOutput: true,
          supportsStreaming: true,
          contextWindow: 8192,
          tasks: {
            textGeneration: true,
            codeGeneration: true,
            reasoning: true,
            analysis: true,
            summarization: true,
            translation: true,
            questionAnswering: true,
            creativeWriting: true,
            structuredOutput: true
          },
          performance: {
            speed: 'fast',
            quality: 'excellent',
            reasoning: 'excellent'
          }
        },
        'moonshotai/kimi-k2-instruct': {
          maxTokens: 8192,
          supportsVision: false,
          supportsAudio: false,
          supportsFunctionCalling: false,
          supportsJSONOutput: true,
          supportsStreaming: true,
          contextWindow: 8192,
          tasks: {
            textGeneration: true,
            codeGeneration: true,
            reasoning: true,
            analysis: true,
            summarization: true,
            translation: true,
            questionAnswering: true,
            creativeWriting: true,
            structuredOutput: true
          },
          performance: {
            speed: 'fast',
            quality: 'excellent',
            reasoning: 'excellent'
          }
        },
        'openai/gpt-oss-20b': {
          maxTokens: 8192,
          supportsVision: false,
          supportsAudio: false,
          supportsFunctionCalling: false,
          supportsJSONOutput: true,
          supportsStreaming: true,
          contextWindow: 8192,
          tasks: {
            textGeneration: true,
            codeGeneration: true,
            reasoning: true,
            analysis: true,
            summarization: true,
            translation: true,
            questionAnswering: true,
            creativeWriting: true,
            structuredOutput: true
          },
          performance: {
            speed: 'fast',
            quality: 'excellent',
            reasoning: 'excellent'
          }
        },
        'openai/gpt-oss-120b': {
          maxTokens: 8192,
          supportsVision: false,
          supportsAudio: false,
          supportsFunctionCalling: false,
          supportsJSONOutput: true,
          supportsStreaming: true,
          contextWindow: 8192,
          tasks: {
            textGeneration: true,
            codeGeneration: true,
            reasoning: true,
            analysis: true,
            summarization: true,
            translation: true,
            questionAnswering: true,
            creativeWriting: true,
            structuredOutput: true
          },
          performance: {
            speed: 'medium',
            quality: 'state-of-the-art',
            reasoning: 'state-of-the-art'
          }
        },
        'allam-2-7b': {
          maxTokens: 8192,
          supportsVision: false,
          supportsAudio: false,
          supportsFunctionCalling: false,
          supportsJSONOutput: true,
          supportsStreaming: true,
          contextWindow: 8192,
          tasks: {
            textGeneration: true,
            codeGeneration: true,
            reasoning: false,
            analysis: true,
            summarization: true,
            translation: true,
            questionAnswering: true,
            creativeWriting: true,
            structuredOutput: true
          },
          performance: {
            speed: 'ultra-fast',
            quality: 'good',
            reasoning: 'basic'
          }
        },
        'deepseek-r1-distill-llama-70b': {
          maxTokens: 8192,
          supportsVision: false,
          supportsAudio: false,
          supportsFunctionCalling: false,
          supportsJSONOutput: true,
          supportsStreaming: true,
          contextWindow: 8192,
          tasks: {
            textGeneration: true,
            codeGeneration: true,
            reasoning: true,
            analysis: true,
            summarization: true,
            translation: true,
            questionAnswering: true,
            creativeWriting: true,
            structuredOutput: true
          },
          performance: {
            speed: 'fast',
            quality: 'excellent',
            reasoning: 'excellent'
          }
        },
        'whisper-large-v3': {
          maxTokens: 8192,
          supportsVision: false,
          supportsAudio: true,
          supportsFunctionCalling: false,
          supportsJSONOutput: true,
          supportsStreaming: true,
          contextWindow: 8192,
          tasks: {
            textGeneration: true,
            codeGeneration: false,
            reasoning: false,
            analysis: true,
            summarization: true,
            translation: false,
            questionAnswering: true,
            creativeWriting: false,
            structuredOutput: false
          },
          performance: {
            speed: 'fast',
            quality: 'excellent',
            reasoning: 'basic'
          }
        },
        'whisper-large-v3-turbo': {
          maxTokens: 8192,
          supportsVision: false,
          supportsAudio: true,
          supportsFunctionCalling: false,
          supportsJSONOutput: true,
          supportsStreaming: true,
          contextWindow: 8192,
          tasks: {
            textGeneration: true,
            codeGeneration: false,
            reasoning: false,
            analysis: true,
            summarization: true,
            translation: false,
            questionAnswering: true,
            creativeWriting: false,
            structuredOutput: false
          },
          performance: {
            speed: 'ultra-fast',
            quality: 'excellent',
            reasoning: 'basic'
          }
        },
        'distil-whisper-large-v3-en': {
          maxTokens: 8192,
          supportsVision: false,
          supportsAudio: true,
          supportsFunctionCalling: false,
          supportsJSONOutput: true,
          supportsStreaming: true,
          contextWindow: 8192,
          tasks: {
            textGeneration: true,
            codeGeneration: false,
            reasoning: false,
            analysis: true,
            summarization: true,
            translation: false,
            questionAnswering: true,
            creativeWriting: false,
            structuredOutput: false
          },
          performance: {
            speed: 'ultra-fast',
            quality: 'good',
            reasoning: 'basic'
          }
        },
        'playai-tts': {
          maxTokens: 8192,
          supportsVision: false,
          supportsAudio: true,
          supportsFunctionCalling: false,
          supportsJSONOutput: true,
          supportsStreaming: true,
          contextWindow: 8192,
          tasks: {
            textGeneration: true,
            codeGeneration: false,
            reasoning: false,
            analysis: true,
            summarization: true,
            translation: false,
            questionAnswering: true,
            creativeWriting: false,
            structuredOutput: false
          },
          performance: {
            speed: 'fast',
            quality: 'good',
            reasoning: 'basic'
          }
        },
        'playai-tts-arabic': {
          maxTokens: 8192,
          supportsVision: false,
          supportsAudio: true,
          supportsFunctionCalling: false,
          supportsJSONOutput: true,
          supportsStreaming: true,
          contextWindow: 8192,
          tasks: {
            textGeneration: true,
            codeGeneration: false,
            reasoning: false,
            analysis: true,
            summarization: true,
            translation: false,
            questionAnswering: true,
            creativeWriting: false,
            structuredOutput: false
          },
          performance: {
            speed: 'fast',
            quality: 'good',
            reasoning: 'basic'
          }
        }
      },
      'gemini': {
        'gemini-1.5-flash': {
          maxTokens: 1048576,
          supportsVision: true,
          supportsAudio: false,
          supportsFunctionCalling: true,
          supportsJSONOutput: true,
          supportsStreaming: true,
          contextWindow: 1048576,
          tasks: {
            textGeneration: true,
            codeGeneration: true,
            reasoning: true,
            analysis: true,
            summarization: true,
            translation: true,
            questionAnswering: true,
            creativeWriting: true,
            structuredOutput: true
          },
          performance: {
            speed: 'fast',
            quality: 'excellent',
            reasoning: 'excellent'
          }
        },
        'gemini-1.5-pro': {
          maxTokens: 1048576,
          supportsVision: true,
          supportsAudio: false,
          supportsFunctionCalling: true,
          supportsJSONOutput: true,
          supportsStreaming: true,
          contextWindow: 1048576,
          tasks: {
            textGeneration: true,
            codeGeneration: true,
            reasoning: true,
            analysis: true,
            summarization: true,
            translation: true,
            questionAnswering: true,
            creativeWriting: true,
            structuredOutput: true
          },
          performance: {
            speed: 'medium',
            quality: 'state-of-the-art',
            reasoning: 'state-of-the-art'
          }
        },
        'gemini-pro': {
          maxTokens: 1048576,
          supportsVision: false,
          supportsAudio: false,
          supportsFunctionCalling: true,
          supportsJSONOutput: true,
          supportsStreaming: true,
          contextWindow: 1048576,
          tasks: {
            textGeneration: true,
            codeGeneration: true,
            reasoning: true,
            analysis: true,
            summarization: true,
            translation: true,
            questionAnswering: true,
            creativeWriting: true,
            structuredOutput: true
          },
          performance: {
            speed: 'medium',
            quality: 'excellent',
            reasoning: 'excellent'
          }
        }
      },
      'together': {
        'meta-llama/Llama-Vision-Free': {
          maxTokens: 4096,
          supportsVision: true,
          supportsAudio: false,
          supportsFunctionCalling: false,
          supportsJSONOutput: true,
          supportsStreaming: true,
          contextWindow: 4096,
          tasks: {
            textGeneration: true,
            codeGeneration: true,
            reasoning: false,
            analysis: true,
            summarization: true,
            translation: true,
            questionAnswering: true,
            creativeWriting: true,
            structuredOutput: true
          },
          performance: {
            speed: 'fast',
            quality: 'good',
            reasoning: 'basic'
          }
        },
        'deepseek-ai/DeepSeek-R1-Distill-Llama-70B-free': {
          maxTokens: 8192,
          supportsVision: false,
          supportsAudio: false,
          supportsFunctionCalling: false,
          supportsJSONOutput: true,
          supportsStreaming: true,
          contextWindow: 8192,
          tasks: {
            textGeneration: true,
            codeGeneration: true,
            reasoning: true,
            analysis: true,
            summarization: true,
            translation: true,
            questionAnswering: true,
            creativeWriting: true,
            structuredOutput: true
          },
          performance: {
            speed: 'fast',
            quality: 'excellent',
            reasoning: 'excellent'
          }
        },
        'lgai/exaone-deep-32b': {
          maxTokens: 4096,
          supportsVision: false,
          supportsAudio: false,
          supportsFunctionCalling: false,
          supportsJSONOutput: true,
          supportsStreaming: true,
          contextWindow: 4096,
          tasks: {
            textGeneration: true,
            codeGeneration: true,
            reasoning: false,
            analysis: true,
            summarization: true,
            translation: true,
            questionAnswering: true,
            creativeWriting: true,
            structuredOutput: true
          },
          performance: {
            speed: 'fast',
            quality: 'good',
            reasoning: 'basic'
          }
        },
        'lgai/exaone-3-5-32b-instruct': {
          maxTokens: 4096,
          supportsVision: false,
          supportsAudio: false,
          supportsFunctionCalling: false,
          supportsJSONOutput: true,
          supportsStreaming: true,
          contextWindow: 4096,
          tasks: {
            textGeneration: true,
            codeGeneration: true,
            reasoning: false,
            analysis: true,
            summarization: true,
            translation: true,
            questionAnswering: true,
            creativeWriting: true,
            structuredOutput: true
          },
          performance: {
            speed: 'fast',
            quality: 'good',
            reasoning: 'basic'
          }
        },
        'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free': {
          maxTokens: 8192,
          supportsVision: false,
          supportsAudio: false,
          supportsFunctionCalling: false,
          supportsJSONOutput: true,
          supportsStreaming: true,
          contextWindow: 8192,
          tasks: {
            textGeneration: true,
            codeGeneration: true,
            reasoning: true,
            analysis: true,
            summarization: true,
            translation: true,
            questionAnswering: true,
            creativeWriting: true,
            structuredOutput: true
          },
          performance: {
            speed: 'fast',
            quality: 'excellent',
            reasoning: 'excellent'
          }
        }
      },
      'cerebras': {
        'llama-3.3-70b': {
          maxTokens: 8192,
          supportsVision: false,
          supportsAudio: false,
          supportsFunctionCalling: true,
          supportsJSONOutput: true,
          supportsStreaming: true,
          contextWindow: 8192,
          tasks: {
            textGeneration: true, codeGeneration: true, reasoning: true,
            analysis: true, summarization: true, translation: true,
            questionAnswering: true, creativeWriting: true, structuredOutput: true
          },
          performance: { speed: 'ultra-fast', quality: 'excellent', reasoning: 'excellent' }
        },
        'llama3.1-70b': {
          maxTokens: 8192,
          supportsVision: false,
          supportsAudio: false,
          supportsFunctionCalling: true,
          supportsJSONOutput: true,
          supportsStreaming: true,
          contextWindow: 8192,
          tasks: {
            textGeneration: true, codeGeneration: true, reasoning: true,
            analysis: true, summarization: true, translation: true,
            questionAnswering: true, creativeWriting: true, structuredOutput: true
          },
          performance: { speed: 'ultra-fast', quality: 'excellent', reasoning: 'excellent' }
        },
        'qwen-3-235b': {
          maxTokens: 32768,
          supportsVision: false,
          supportsAudio: false,
          supportsFunctionCalling: false,
          supportsJSONOutput: true,
          supportsStreaming: true,
          contextWindow: 32768,
          tasks: {
            textGeneration: true, codeGeneration: true, reasoning: true,
            analysis: true, summarization: true, translation: true,
            questionAnswering: true, creativeWriting: true, structuredOutput: true
          },
          performance: { speed: 'fast', quality: 'excellent', reasoning: 'state-of-the-art' }
        }
      },
      'cloudflare': {
        '@cf/meta/llama-3.3-70b-instruct-fp8-fast': {
          maxTokens: 4096,
          supportsVision: false,
          supportsAudio: false,
          supportsFunctionCalling: false,
          supportsJSONOutput: false,
          supportsStreaming: true,
          contextWindow: 4096,
          tasks: {
            textGeneration: true, codeGeneration: true, reasoning: true,
            analysis: true, summarization: true, translation: true,
            questionAnswering: true, creativeWriting: true, structuredOutput: false
          },
          performance: { speed: 'fast', quality: 'good', reasoning: 'good' }
        }
      },
      'ollama': {
        'qwen3-coder:480b-cloud': {
          maxTokens: 32768,
          supportsVision: false,
          supportsAudio: false,
          supportsFunctionCalling: false,
          supportsJSONOutput: true,
          supportsStreaming: true,
          contextWindow: 32768,
          tasks: {
            textGeneration: true, codeGeneration: true, reasoning: true,
            analysis: true, summarization: true, translation: true,
            questionAnswering: true, creativeWriting: true, structuredOutput: true
          },
          performance: { speed: 'medium', quality: 'excellent', reasoning: 'excellent' }
        }
      },
      'openrouter': {
        'meta-llama/llama-3.1-70b-instruct:free': {
          maxTokens: 8192,
          supportsVision: false,
          supportsAudio: false,
          supportsFunctionCalling: false,
          supportsJSONOutput: true,
          supportsStreaming: true,
          contextWindow: 8192,
          tasks: {
            textGeneration: true, codeGeneration: true, reasoning: true,
            analysis: true, summarization: true, translation: true,
            questionAnswering: true, creativeWriting: true, structuredOutput: true
          },
          performance: { speed: 'fast', quality: 'excellent', reasoning: 'excellent' }
        }
      },
      'cohere': {
        'command-r': {
          maxTokens: 128000,
          supportsVision: false,
          supportsAudio: false,
          supportsFunctionCalling: true,
          supportsJSONOutput: false,
          supportsStreaming: true,
          contextWindow: 128000,
          tasks: {
            textGeneration: true, codeGeneration: true, reasoning: true,
            analysis: true, summarization: true, translation: true,
            questionAnswering: true, creativeWriting: true, structuredOutput: false
          },
          performance: { speed: 'medium', quality: 'excellent', reasoning: 'good' }
        }
      },
      'llmgateway': {
        'llama-4-maverick-free': {
          maxTokens: 8192,
          supportsVision: false,
          supportsAudio: false,
          supportsFunctionCalling: false,
          supportsJSONOutput: false,
          supportsStreaming: true,
          contextWindow: 8192,
          tasks: {
            textGeneration: true, codeGeneration: true, reasoning: true,
            analysis: true, summarization: true, translation: true,
            questionAnswering: true, creativeWriting: true, structuredOutput: false
          },
          performance: { speed: 'fast', quality: 'excellent', reasoning: 'excellent' }
        }
      }
    };

    this.normalizeCapabilities();
  }

  /**
   * Populate canonical OpenAI-compatible capability flags across all entries:
   *   - supportsToolCalling (the model can do it AND we forward `tools` to it)
   *   - supportsJSONMode    (mirrors supportsJSONOutput)
   *   - supportsJSONSchema  (explicit allowlist)
   *
   * The two tool flags answer different questions and are deliberately allowed
   * to disagree (F-04):
   *
   *   supportsFunctionCalling — "can this model call functions at all?" A fact
   *     about the model, used by aiDirectorService when it scores candidates.
   *   supportsToolCalling     — "will a `tools` request routed here actually
   *     arrive?" A fact about *our* adapter, used by the rotation gate. False
   *     for every provider outside TOOL_FORWARDING_PROVIDERS, however capable
   *     the model itself is, because a request that reaches an adapter which
   *     drops `tools` comes back as prose with finish_reason "stop".
   */
  normalizeCapabilities() {
    for (const [provider, models] of Object.entries(this.knownCapabilities)) {
      for (const [modelId, caps] of Object.entries(models)) {
        const toolCallingCorrected = toolCallingCorrectedFor(provider, modelId);
        const modelCanCall = caps.supportsFunctionCalling || toolCallingCorrected;

        caps.supportsFunctionCalling = modelCanCall;
        caps.supportsToolCalling = modelCanCall && forwardsTools(provider);
        // supportsJSONMode / supportsJSONSchema reflect whether aiService has
        // a native response_format translation for this pair; the legacy
        // supportsJSONOutput flag is a looser "model is generally JSON-capable"
        // signal and is left untouched.
        caps.supportsJSONMode = jsonModeSupportedFor(provider, modelId);
        caps.supportsJSONSchema = schemaSupportedFor(provider, modelId);
      }
    }
  }

  /**
   * Canonical accessor: returns the full capabilities object for a provider/model,
   * falling back to inferCapabilities() for unknown models. Always returns an
   * object with the canonical flag set populated.
   */
  getCapabilities(provider, modelId) {
    const known = this.knownCapabilities[provider]?.[modelId];
    if (known) return known;
    const inferred = this.inferCapabilities(modelId);
    inferred.supportsToolCalling = inferred.supportsFunctionCalling && forwardsTools(provider);
    inferred.supportsJSONMode = jsonModeSupportedFor(provider, modelId);
    inferred.supportsJSONSchema = schemaSupportedFor(provider, modelId);
    return inferred;
  }

  /**
   * True if a `tools` request routed to this provider/model will actually reach
   * it as `tools` — i.e. the model can call functions AND aiService's adapter
   * for this provider forwards the parameter. See TOOL_FORWARDING_PROVIDERS.
   */
  supportsTools(provider, modelId) {
    return !!this.getCapabilities(provider, modelId).supportsToolCalling;
  }

  /** True for response_format: {type: "json_object"}. */
  supportsJSONMode(provider, modelId) {
    return !!this.getCapabilities(provider, modelId).supportsJSONMode;
  }

  /** True for response_format: {type: "json_schema", json_schema: {...}}. */
  supportsJSONSchema(provider, modelId) {
    return !!this.getCapabilities(provider, modelId).supportsJSONSchema;
  }

  async updateModelCapabilities(provider, modelId) {
    try {
      // Get known capabilities or infer from model name
      const capabilities = this.knownCapabilities[provider]?.[modelId] || this.inferCapabilities(modelId);

      // Update the model in the database
      await AIModel.findOneAndUpdate(
        { provider, modelId },
        {
          $set: {
            capabilities,
            lastChecked: new Date()
          }
        },
        { upsert: true }
      );

      return { success: true, capabilities };
    } catch (error) {
      logger.error({ err: error }, 'Error updating model capabilities');
      return { success: false, error: error.message };
    }
  }

  inferCapabilities(modelId) {
    // Handle null/undefined modelId
    if (!modelId) {
      return {
        maxTokens: 4096,
        supportsVision: false,
        supportsAudio: false,
        supportsFunctionCalling: false,
        supportsToolCalling: false,
        supportsJSONOutput: true,
        supportsJSONMode: true,
        supportsJSONSchema: false,
        supportsStreaming: true,
        contextWindow: 4096,
        tasks: {
          textGeneration: true,
          codeGeneration: true,
          reasoning: false,
          analysis: true,
          summarization: true,
          translation: true,
          questionAnswering: true,
          creativeWriting: true,
          structuredOutput: true
        },
        performance: {
          speed: 'medium',
          quality: 'good',
          reasoning: 'basic'
        }
      };
    }

    const capabilities = {
      maxTokens: 4096,
      supportsVision: false,
      supportsAudio: false,
      supportsFunctionCalling: false,
      supportsToolCalling: false,
      supportsJSONOutput: true,
      supportsJSONMode: true,
      supportsJSONSchema: false,
      supportsStreaming: true,
      contextWindow: 4096,
      tasks: {
        textGeneration: true,
        codeGeneration: true,
        reasoning: false,
        analysis: true,
        summarization: true,
        translation: true,
        questionAnswering: true,
        creativeWriting: true,
        structuredOutput: true
      },
      performance: {
        speed: 'medium',
        quality: 'good',
        reasoning: 'basic'
      }
    };

    // Infer from model name patterns
    const modelLower = modelId.toLowerCase();

    // Vision capabilities
    if (modelLower.includes('vision') || modelLower.includes('multimodal')) {
      capabilities.supportsVision = true;
    }

    // Audio capabilities
    if (modelLower.includes('whisper') || modelLower.includes('tts') || modelLower.includes('audio')) {
      capabilities.supportsAudio = true;
      capabilities.tasks.codeGeneration = false;
      capabilities.tasks.creativeWriting = false;
      capabilities.tasks.structuredOutput = false;
    }

    // Model size and performance inference
    if (modelLower.includes('70b') || modelLower.includes('70b') || modelLower.includes('405b')) {
      capabilities.maxTokens = 8192;
      capabilities.contextWindow = 8192;
      capabilities.tasks.reasoning = true;
      capabilities.performance.reasoning = 'excellent';
      capabilities.performance.quality = 'excellent';
    }

    if (modelLower.includes('405b')) {
      capabilities.performance.reasoning = 'state-of-the-art';
      capabilities.performance.quality = 'state-of-the-art';
    }

    if (modelLower.includes('8b') || modelLower.includes('9b')) {
      capabilities.maxTokens = 8192;
      capabilities.contextWindow = 8192;
      capabilities.performance.speed = 'ultra-fast';
    }

    if (modelLower.includes('instant') || modelLower.includes('turbo')) {
      capabilities.performance.speed = 'ultra-fast';
    }

    // Function calling inference (mainly for Claude models)
    if (modelLower.includes('claude') || modelLower.includes('gemini')) {
      capabilities.supportsFunctionCalling = true;
      capabilities.supportsToolCalling = true;
      capabilities.supportsJSONSchema = true;
    }

    // Guard models are specialized
    if (modelLower.includes('guard')) {
      capabilities.tasks.codeGeneration = false;
      capabilities.tasks.creativeWriting = false;
      capabilities.tasks.structuredOutput = false;
      capabilities.tasks.translation = false;
    }

    // Large context models
    if (modelLower.includes('200k') || modelLower.includes('1m')) {
      capabilities.maxTokens = 200000;
      capabilities.contextWindow = 200000;
    }

    if (modelLower.includes('1048576') || modelLower.includes('1m')) {
      capabilities.maxTokens = 1048576;
      capabilities.contextWindow = 1048576;
    }

    return capabilities;
  }

  async getModelsForTask(task, requirements = {}) {
    try {
      const {
        needsVision = false,
        needsAudio = false,
        needsFunctionCalling = false,
        needsJSONOutput = false,
        needsReasoning = false,
        needsCodeGeneration = false,
        maxTokens = 4096,
        priority = 'cost' // 'cost', 'speed', 'quality'
      } = requirements;

      // Build query based on requirements
      const query = {
        isActive: true,
        'capabilities.maxTokens': { $gte: maxTokens }
      };

      if (needsVision) query['capabilities.supportsVision'] = true;
      if (needsAudio) query['capabilities.supportsAudio'] = true;
      if (needsFunctionCalling) query['capabilities.supportsFunctionCalling'] = true;
      if (needsJSONOutput) query['capabilities.supportsJSONOutput'] = true;
      if (needsReasoning) query['capabilities.performance.reasoning'] = { $in: ['good', 'excellent', 'state-of-the-art'] };
      if (needsCodeGeneration) query['capabilities.tasks.codeGeneration'] = true;

      const models = await AIModel.find(query).populate('pricing').populate('freeTier');

      // Sort based on priority
      const sortedModels = models.sort((a, b) => {
        if (priority === 'cost') {
          // Prioritize free models, then by cost
          const aIsFree = a.freeTier?.isFree || false;
          const bIsFree = b.freeTier?.isFree || false;
          if (aIsFree && !bIsFree) return -1;
          if (!aIsFree && bIsFree) return 1;
          return (a.pricing?.input || 999) - (b.pricing?.input || 999);
        } else if (priority === 'speed') {
          const speedOrder = { 'ultra-fast': 0, 'fast': 1, 'medium': 2, 'slow': 3 };
          return speedOrder[a.capabilities?.performance?.speed || 'medium'] - speedOrder[b.capabilities?.performance?.speed || 'medium'];
        } else if (priority === 'quality') {
          const qualityOrder = { 'state-of-the-art': 0, 'excellent': 1, 'good': 2, 'basic': 3 };
          return qualityOrder[a.capabilities?.performance?.quality || 'good'] - qualityOrder[b.capabilities?.performance?.quality || 'good'];
        }
        return 0;
      });

      return {
        success: true,
        models: sortedModels,
        total: sortedModels.length
      };
    } catch (error) {
      logger.error({ err: error }, 'Failed to get models for task');
      return {
        success: false,
        error: error.message
      };
    }
  }

  async updateAllModelCapabilities() {
    try {
      const providers = ['anthropic', 'groq', 'gemini', 'together'];
      let updatedCount = 0;

      for (const provider of providers) {
        const models = await AIModel.find({ provider, isActive: true });

        for (const model of models) {
          const updated = await this.updateModelCapabilities(provider, model.modelId);
          if (updated) updatedCount++;
        }
      }

      logger.info(`Updated capabilities for ${updatedCount} models`);
      return {
        success: true,
        updatedCount
      };
    } catch (error) {
      logger.error({ err: error }, 'Failed to update all model capabilities');
      return {
        success: false,
        error: error.message
      };
    }
  }
}

export default new AIModelCapabilitiesService();
