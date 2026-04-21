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
    it('is true for any Anthropic model (wildcard allowlist)', () => {
      expect(caps.supportsJSONSchema('anthropic', 'claude-3-5-sonnet-20241022')).toBe(true);
      expect(caps.supportsJSONSchema('anthropic', 'claude-opus-4-1-20250805')).toBe(true);
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
      // An unknown Anthropic model hits inferCapabilities but the
      // wildcard 'anthropic:*' still reports schema support.
      expect(caps.supportsJSONSchema('anthropic', 'claude-future-20991231')).toBe(true);
      expect(caps.supportsJSONSchema('groq', 'some-unknown-model')).toBe(false);
    });
  });

  describe('supportsJSONMode', () => {
    it('mirrors JSONSchema allowlist (anthropic + gemini only for now)', () => {
      expect(caps.supportsJSONMode('anthropic', 'claude-3-5-sonnet-20241022')).toBe(true);
      expect(caps.supportsJSONMode('gemini', 'gemini-1.5-flash')).toBe(true);
      expect(caps.supportsJSONMode('groq', 'llama-3.3-70b-versatile')).toBe(false);
    });
  });

  describe('supportsTools', () => {
    it('is true for all Anthropic models (native tool use)', () => {
      expect(caps.supportsTools('anthropic', 'claude-3-5-sonnet-20241022')).toBe(true);
      expect(caps.supportsTools('anthropic', 'claude-3-5-haiku-20241022')).toBe(true);
    });

    it('is true for Gemini flagship models (native function calling)', () => {
      expect(caps.supportsTools('gemini', 'gemini-1.5-flash')).toBe(true);
      expect(caps.supportsTools('gemini', 'gemini-1.5-pro')).toBe(true);
    });

    it('is true for corrected Groq models (patched by TOOL_CALLING_CORRECTIONS)', () => {
      // Legacy data in knownCapabilities had supportsFunctionCalling:false for
      // Groq — corrections patch the post-normalize view for models that
      // actually DO support tool calling.
      expect(caps.supportsTools('groq', 'llama-3.3-70b-versatile')).toBe(true);
      expect(caps.supportsTools('groq', 'llama-3.1-70b-versatile')).toBe(true);
      expect(caps.supportsTools('groq', 'openai/gpt-oss-120b')).toBe(true);
    });

    it('is false for providers without tool-calling support', () => {
      expect(caps.supportsTools('cloudflare', '@cf/meta/llama-3.3-70b-instruct-fp8-fast')).toBe(false);
      expect(caps.supportsTools('together', 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free')).toBe(false);
    });
  });

  describe('getCapabilities', () => {
    it('returns populated canonical flags on known entries', () => {
      const c = caps.getCapabilities('anthropic', 'claude-3-5-sonnet-20241022');
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
  });
});
