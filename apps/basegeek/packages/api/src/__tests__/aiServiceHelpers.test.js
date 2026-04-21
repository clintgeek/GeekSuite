/**
 * aiService structured-output helper tests.
 *
 * Tests pure-function methods on the aiService singleton:
 *   - structuredOutputFingerprint: stability + segregation
 *   - getCacheKey: collision avoidance for different structured shapes
 *   - repairJSONContent: markdown-fence strip + balanced-JSON extract
 *   - buildStructuredFallbackInstruction + wrapMessagesForStructuredFallback
 *
 * These run against the singleton but never trigger provider HTTP calls —
 * the methods are synchronous transforms over their inputs.
 */

import { describe, it, expect } from '@jest/globals';
import aiService from '../services/aiService.js';

describe('aiService — structuredOutputFingerprint', () => {
  it('returns empty string when no structured params are set', () => {
    expect(aiService.structuredOutputFingerprint(null, null, null)).toBe('');
    expect(aiService.structuredOutputFingerprint(undefined, undefined, undefined)).toBe('');
  });

  it('is stable for equivalent inputs', () => {
    const rf = { type: 'json_schema', json_schema: { name: 'Foo', schema: { type: 'object' } } };
    const a = aiService.structuredOutputFingerprint(rf, null, null);
    const b = aiService.structuredOutputFingerprint(rf, null, null);
    expect(a).toBe(b);
    expect(a).not.toBe('');
  });

  it('differs for different response_format shapes', () => {
    const rfObj = { type: 'json_object' };
    const rfSchema = { type: 'json_schema', json_schema: { name: 'X', schema: {} } };
    expect(aiService.structuredOutputFingerprint(rfObj, null, null))
      .not.toBe(aiService.structuredOutputFingerprint(rfSchema, null, null));
  });

  it('differs when tools change', () => {
    const toolsA = [{ type: 'function', function: { name: 'read_file' } }];
    const toolsB = [{ type: 'function', function: { name: 'write_file' } }];
    expect(aiService.structuredOutputFingerprint(null, toolsA, null))
      .not.toBe(aiService.structuredOutputFingerprint(null, toolsB, null));
  });
});

describe('aiService — getCacheKey', () => {
  it('produces different keys for identical prompts with different structured fingerprints', () => {
    const plain = aiService.getCacheKey('hello', 'groq', 'llama-3.3-70b-versatile', 0.7, 'default', '');
    const schema = aiService.getCacheKey('hello', 'groq', 'llama-3.3-70b-versatile', 0.7, 'default', 'abc123');
    expect(plain).not.toBe(schema);
  });

  it('is stable for identical inputs', () => {
    const a = aiService.getCacheKey('hello', 'groq', 'llama-3.3-70b-versatile', 0.7, 'default', 'abc');
    const b = aiService.getCacheKey('hello', 'groq', 'llama-3.3-70b-versatile', 0.7, 'default', 'abc');
    expect(a).toBe(b);
  });

  it('leaves pre-structured-output cache entries intact (empty fingerprint matches default)', () => {
    // Default arg for structuredFingerprint is '' — must match a call that
    // was made before the parameter existed.
    const withDefault = aiService.getCacheKey('hello', 'groq', 'm', 0.7, 'default');
    const withEmpty = aiService.getCacheKey('hello', 'groq', 'm', 0.7, 'default', '');
    expect(withDefault).toBe(withEmpty);
  });
});

describe('aiService — repairJSONContent', () => {
  it('passes clean JSON through unchanged', () => {
    const clean = '{"name": "Alice", "age": 30}';
    expect(aiService.repairJSONContent(clean)).toBe(clean);
  });

  it('strips ```json ... ``` fences', () => {
    const fenced = '```json\n{"ok": true}\n```';
    expect(aiService.repairJSONContent(fenced)).toBe('{"ok": true}');
  });

  it('strips plain ``` fences', () => {
    const fenced = '```\n[1, 2, 3]\n```';
    expect(aiService.repairJSONContent(fenced)).toBe('[1, 2, 3]');
  });

  it('extracts JSON when surrounded by prose', () => {
    const msg = 'Sure, here is the JSON you requested: {"result": 42} Let me know if you need anything else.';
    expect(aiService.repairJSONContent(msg)).toBe('{"result": 42}');
  });

  it('handles nested braces correctly via depth counting', () => {
    const nested = 'prefix {"outer": {"inner": {"deep": "value"}}} suffix';
    expect(aiService.repairJSONContent(nested)).toBe('{"outer": {"inner": {"deep": "value"}}}');
  });

  it('handles string literals containing braces', () => {
    const tricky = '{"code": "if (x) { return y; }"}';
    expect(aiService.repairJSONContent(tricky)).toBe(tricky);
  });

  it('returns original content if no JSON is found', () => {
    const prose = 'Sorry, I cannot help with that.';
    expect(aiService.repairJSONContent(prose)).toBe(prose);
  });

  it('handles non-string input safely', () => {
    expect(aiService.repairJSONContent(null)).toBe(null);
    expect(aiService.repairJSONContent(42)).toBe(42);
  });
});

describe('aiService — structured-output fallback wrapping', () => {
  it('builds a json_object instruction without a schema reference', () => {
    const instruction = aiService.buildStructuredFallbackInstruction({ type: 'json_object' });
    expect(instruction).toMatch(/valid JSON/i);
    expect(instruction).not.toMatch(/JSON Schema/i);
  });

  it('builds a json_schema instruction that inlines the schema', () => {
    const rf = {
      type: 'json_schema',
      json_schema: { name: 'Person', schema: { type: 'object', properties: { name: { type: 'string' } } } }
    };
    const instruction = aiService.buildStructuredFallbackInstruction(rf);
    expect(instruction).toMatch(/JSON Schema/i);
    expect(instruction).toMatch(/"type":"object"/);
    expect(instruction).toMatch(/Person/);
  });

  it('returns null for unsupported response_format types', () => {
    expect(aiService.buildStructuredFallbackInstruction(null)).toBe(null);
    expect(aiService.buildStructuredFallbackInstruction({ type: 'unknown' })).toBe(null);
  });

  it('wraps messages by appending to an existing system turn', () => {
    const messages = [
      { role: 'system', content: 'You are a helper.' },
      { role: 'user', content: 'Give me JSON.' }
    ];
    const rf = { type: 'json_object' };
    const wrapped = aiService.wrapMessagesForStructuredFallback(messages, '', rf);
    expect(wrapped.messages).toHaveLength(2);
    expect(wrapped.messages[0].role).toBe('system');
    expect(wrapped.messages[0].content).toMatch(/You are a helper\./);
    expect(wrapped.messages[0].content).toMatch(/valid JSON/i);
    expect(wrapped.messages[1]).toEqual({ role: 'user', content: 'Give me JSON.' });
  });

  it('wraps messages by inserting a new system turn when none exists', () => {
    const messages = [{ role: 'user', content: 'Hi.' }];
    const rf = { type: 'json_object' };
    const wrapped = aiService.wrapMessagesForStructuredFallback(messages, '', rf);
    expect(wrapped.messages[0].role).toBe('system');
    expect(wrapped.messages[0].content).toMatch(/valid JSON/i);
    expect(wrapped.messages[1]).toEqual({ role: 'user', content: 'Hi.' });
  });

  it('synthesizes system + user turns when messages is missing', () => {
    const rf = { type: 'json_object' };
    const wrapped = aiService.wrapMessagesForStructuredFallback(null, 'What is 2+2?', rf);
    expect(wrapped.messages).toHaveLength(2);
    expect(wrapped.messages[0].role).toBe('system');
    expect(wrapped.messages[1]).toEqual({ role: 'user', content: 'What is 2+2?' });
  });

  it('passes messages through unchanged when responseFormat is not handled', () => {
    const messages = [{ role: 'user', content: 'Hi.' }];
    const wrapped = aiService.wrapMessagesForStructuredFallback(messages, '', { type: 'other' });
    expect(wrapped.messages).toBe(messages); // reference equality — no change
  });
});
