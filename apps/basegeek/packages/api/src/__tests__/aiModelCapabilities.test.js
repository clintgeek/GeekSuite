/**
 * aiModelCapabilitiesService unit tests.
 *
 * Covers the canonical OpenAI-compatible capability flags introduced in the
 * aiGeek polish plan (supportsTools, supportsJSONMode, supportsJSONSchema)
 * and the accessor methods the aiService rotation logic consumes.
 *
 * These tests are self-contained — no network, no Mongo writes. The service
 * imports AIModel (which opens an aiGeek Mongoose connection) but never
 * calls it here.
 */

import { describe, it, expect } from '@jest/globals';
import caps from '../services/aiModelCapabilitiesService.js';

describe('aiModelCapabilitiesService — canonical capability flags', () => {
  describe('supportsJSONSchema', () => {
    // `anthropic:*` was the other wildcard in this allowlist until 2026-09-07,
    // when the provider was retired (out of credit, gone for good) along with
    // callClaude's native json_schema translation. Nothing is left to forward
    // a response_format to, so the honest answer is false — and this case is
    // the tripwire that keeps a copy-pasted allowlist from claiming otherwise.
    it('is false for the retired anthropic provider', () => {
      expect(caps.supportsJSONSchema('anthropic', 'claude-3-5-sonnet-20241022')).toBe(false);
      expect(caps.supportsJSONSchema('anthropic', 'claude-opus-4-1-20250805')).toBe(false);
    });

    it('is true for any Gemini model (wildcard allowlist)', () => {
      expect(caps.supportsJSONSchema('gemini', 'gemini-1.5-flash')).toBe(true);
      expect(caps.supportsJSONSchema('gemini', 'gemini-1.5-pro')).toBe(true);
    });

    it('is false for providers without a native response_format translation', () => {
      // Groq, Cerebras, Together, etc. have no native translation yet — they
      // fall through to the prompt-injection fallback.
      expect(caps.supportsJSONSchema('groq', 'llama-3.3-70b-versatile')).toBe(false);
      expect(caps.supportsJSONSchema('cerebras', 'qwen-3-235b')).toBe(false);
      expect(caps.supportsJSONSchema('together', 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free')).toBe(false);
      expect(caps.supportsJSONSchema('cloudflare', '@cf/meta/llama-3.3-70b-instruct-fp8-fast')).toBe(false);
    });

    it('falls back via inferCapabilities for unknown models (still wildcard-aware)', () => {
      // An unknown Gemini model hits inferCapabilities but the
      // wildcard 'gemini:*' still reports schema support.
      expect(caps.supportsJSONSchema('gemini', 'gemini-future-20991231')).toBe(true);
      expect(caps.supportsJSONSchema('groq', 'some-unknown-model')).toBe(false);
    });
  });

  describe('supportsJSONMode', () => {
    it('mirrors JSONSchema allowlist (gemini only, since anthropic left)', () => {
      expect(caps.supportsJSONMode('gemini', 'gemini-1.5-flash')).toBe(true);
      expect(caps.supportsJSONMode('groq', 'llama-3.3-70b-versatile')).toBe(false);
      expect(caps.supportsJSONMode('anthropic', 'claude-3-5-sonnet-20241022')).toBe(false);
    });
  });

  describe('supportsTools', () => {
    // `anthropic` was the first entry in TOOL_FORWARDING_PROVIDERS: callClaude
    // forwarded tools, honoured all four tool_choice forms, and read tool_use
    // blocks back. It went with the provider on 2026-09-07. A provider marked
    // tool-capable with no adapter behind it does not fail loudly — it gets
    // *selected* and the tools are dropped silently (FINDING F-04) — so this
    // case now asserts the absence.
    it('is false for the retired anthropic provider (no adapter left)', () => {
      expect(caps.supportsTools('anthropic', 'claude-3-5-sonnet-20241022')).toBe(false);
      expect(caps.supportsTools('anthropic', 'claude-3-5-haiku-20241022')).toBe(false);
    });

    it('is true for Gemini flagship models (native function calling)', () => {
      expect(caps.supportsTools('gemini', 'gemini-1.5-flash')).toBe(true);
      expect(caps.supportsTools('gemini', 'gemini-1.5-pro')).toBe(true);
    });

    it('is true for every Groq model, because callGroq forwards tools', () => {
      // Until 2026-09-07 this was a twelve-id allowlist (TOOL_CALLING_CORRECTIONS)
      // patching a hand-typed table that claimed supportsFunctionCalling:false
      // for Groq. Both are gone: whether a `tools` request arrives is a fact
      // about the adapter, so the answer is the same for any Groq id, including
      // one the catalog has never seen.
      expect(caps.supportsTools('groq', 'llama-3.3-70b-versatile')).toBe(true);
      expect(caps.supportsTools('groq', 'llama-3.1-70b-versatile')).toBe(true);
      expect(caps.supportsTools('groq', 'openai/gpt-oss-120b')).toBe(true);
      expect(caps.supportsTools('groq', 'a-model-shipped-tomorrow')).toBe(true);
    });

    it('is false for providers without tool-calling support', () => {
      expect(caps.supportsTools('cloudflare', '@cf/meta/llama-3.3-70b-instruct-fp8-fast')).toBe(false);
      expect(caps.supportsTools('together', 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free')).toBe(false);
    });
  });

  describe('getCapabilities', () => {
    it('returns populated canonical flags for a native-translation provider', () => {
      const c = caps.getCapabilities('gemini', 'gemini-1.5-flash');
      expect(c).toMatchObject({
        supportsToolCalling: true,
        supportsJSONMode: true,
        supportsJSONSchema: true
      });
    });

    it('returns inferred capabilities with canonical flags on unknown models', () => {
      const c = caps.getCapabilities('groq', 'unknown-test-model');
      expect(c).toHaveProperty('supportsToolCalling');
      expect(c).toHaveProperty('supportsJSONMode');
      expect(c).toHaveProperty('supportsJSONSchema');
      // Unknown groq model: no native translation
      expect(c.supportsJSONSchema).toBe(false);
    });

    it('keeps legacy supportsFunctionCalling in sync with supportsToolCalling', () => {
      const c = caps.getCapabilities('groq', 'llama-3.3-70b-versatile');
      expect(c.supportsFunctionCalling).toBe(c.supportsToolCalling);
      expect(c.supportsFunctionCalling).toBe(true);
    });

    /**
     * Phase 1: what a model can do is read from the AIModel row the catalog job
     * writes, not from a table in this file. These two cases pin the choice
     * between the row and the guess — including the case that matters most,
     * because the AIModel schema defaults every capability field: a row that
     * has never been observed reads back as a complete object claiming 4096
     * tokens and no JSON, and preferring THAT to inference would make a
     * refreshed model look worse than an unknown one.
     */
    it('prefers an observed AIModel.capabilities over inference', () => {
      const c = caps.getCapabilities('cloudflare', '@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
        contextWindow: 131072,
        maxTokens: 32768,
        supportsJSONOutput: true,
        performance: { speed: 'fast', quality: 'excellent', reasoning: 'good' }
      });

      expect(c.contextWindow).toBe(131072);
      expect(c.supportsJSONOutput).toBe(true);
      expect(c.performance.quality).toBe('excellent');
      // Adapter facts still overwrite whatever the row claims about them.
      expect(c.supportsToolCalling).toBe(false);
      expect(c.supportsJSONSchema).toBe(false);
    });

    it('ignores a capabilities object that is only schema defaults', () => {
      const bareDefaults = {
        maxTokens: 4096,
        contextWindow: 4096,
        supportsVision: false,
        supportsAudio: false,
        supportsFunctionCalling: false,
        supportsToolCalling: false,
        supportsJSONOutput: false,
        supportsJSONMode: false,
        supportsJSONSchema: false
      };
      const c = caps.getCapabilities('groq', 'llama-3.3-70b-versatile', bareDefaults);

      // Inference has an opinion about a 70B model; the defaults do not.
      expect(c.contextWindow).toBe(8192);
      expect(c.supportsJSONOutput).toBe(true);
    });
  });
});
