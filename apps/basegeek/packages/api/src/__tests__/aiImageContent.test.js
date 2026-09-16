/**
 * aiImageContent.test.js — the image transport for aiGeek's front door.
 *
 * Built for FitnessGeek's body-composition intake
 * (DOCS/BODY_COMPOSITION_INTAKE.md): an attached image travels as a
 * content-parts array on `messages[].content`
 * (`services/ai/adapters/imageContent.js` has the shape). This file pins two
 * things per adapter:
 *
 *   1. A vision-capable dialect (openai-compatible, gemini, ollama) puts the
 *      image on the wire in THAT provider's own native shape.
 *   2. An adapter that cannot transmit an image (cohere, cloudflare) refuses
 *      loudly with `AdapterError('unsupported_content')` — never the old
 *      `JSON.stringify(m.content)` fallthrough that read a base64 blob to
 *      the model as if it were the user's own words (see cloudflare.js's
 *      header for the incident this replaces).
 *
 * Same harness as aiAdapters.test.js: `callAdapter` directly, axios.post
 * stubbed, no network and no Mongo.
 */

import { describe, it, expect, afterEach } from '@jest/globals';
import axios from 'axios';

const { buildProviderConnections } = await import('../config/aiProviders.js');
const { callAdapter } = await import('../services/ai/adapters/index.js');
const { AdapterError } = await import('../services/ai/AdapterError.js');
const { geminiContentsFrom } = await import('../services/ai/adapters/gemini.js');
const {
  partsOf,
  textOnly,
  validateImageBudget,
  MAX_IMAGE_BASE64_BYTES,
  MAX_IMAGES_PER_REQUEST,
} = await import('../services/ai/adapters/imageContent.js');

const CONNECTIONS = buildProviderConnections();
const originalPost = axios.post;
afterEach(() => { axios.post = originalPost; });

function row(providerId, overrides = {}) {
  return {
    ...CONNECTIONS[providerId],
    apiKey: 'test-key-not-a-real-credential',
    baseURL: 'https://provider.invalid/v1',
    ...overrides,
  };
}

function capture(data, headers = {}) {
  const calls = [];
  axios.post = async (url, body, opts) => {
    calls.push({ url, body, opts });
    return { data, headers };
  };
  return calls;
}

const IMAGE_PART = { type: 'image', mediaType: 'image/png', data: 'QUJD' }; // base64("ABC")
const TEXT_PART = { type: 'text', text: 'What is this?' };

/* ── imageContent.js — the shared shape ──────────────────────────────────── */

describe('partsOf / textOnly', () => {
  it('a plain string is unchanged, byte-for-byte — the whole non-vision path', () => {
    expect(partsOf('hello')).toEqual({ text: 'hello', images: [], unrecognized: false });
    expect(textOnly('hello')).toBe('hello');
    expect(textOnly(null)).toBe('');
    expect(textOnly(undefined)).toBe('');
  });

  it('splits a content-parts array into joined text and image parts', () => {
    const { text, images, unrecognized } = partsOf([TEXT_PART, IMAGE_PART]);
    expect(text).toBe('What is this?');
    expect(images).toEqual([{ mediaType: 'image/png', data: 'QUJD' }]);
    expect(unrecognized).toBe(false);
  });

  it('flags a part it does not recognize, rather than dropping or stringifying it', () => {
    expect(partsOf([{ type: 'image_url', image_url: { url: 'x' } }]).unrecognized).toBe(true);
    expect(partsOf([{ type: 'text' }]).unrecognized).toBe(true); // text missing
    expect(partsOf({ some: 'object' }).unrecognized).toBe(true); // not even an array
  });
});

describe('validateImageBudget — the front door\'s size/count gate', () => {
  it('passes a well-formed image within budget', () => {
    expect(validateImageBudget([{ role: 'user', content: [TEXT_PART, IMAGE_PART] }]))
      .toEqual({ ok: true, count: 1 });
  });

  it('passes plain-text messages with no images at all', () => {
    expect(validateImageBudget([{ role: 'user', content: 'hi' }])).toEqual({ ok: true, count: 0 });
    expect(validateImageBudget(null)).toEqual({ ok: true, count: 0 });
  });

  it('refuses an oversized image', () => {
    const huge = { type: 'image', mediaType: 'image/png', data: 'A'.repeat(MAX_IMAGE_BASE64_BYTES + 1) };
    const result = validateImageBudget([{ role: 'user', content: [huge] }]);
    expect(result).toMatchObject({ ok: false, code: 'IMAGE_TOO_LARGE' });
  });

  it('refuses more than the per-request image count', () => {
    const many = Array.from({ length: MAX_IMAGES_PER_REQUEST + 1 }, () => IMAGE_PART);
    const result = validateImageBudget([{ role: 'user', content: many }]);
    expect(result).toMatchObject({ ok: false, code: 'TOO_MANY_IMAGES' });
  });

  it('refuses a media type outside the allow-list', () => {
    const result = validateImageBudget([
      { role: 'user', content: [{ type: 'image', mediaType: 'application/pdf', data: 'QUJD' }] },
    ]);
    expect(result).toMatchObject({ ok: false, code: 'INVALID_IMAGE_MEDIA_TYPE' });
  });
});

/* ── openai-compatible: real vision support ──────────────────────────────── */

describe('the openai-compatible adapter — vision', () => {
  it('translates an image part into image_url with a data: URI, text first', async () => {
    const calls = capture({
      choices: [{ message: { content: 'a chart' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 3 },
    });
    await callAdapter('groq', row('groq'), {
      model: 'llama-vision',
      messages: [{ role: 'user', content: [TEXT_PART, IMAGE_PART] }],
    });
    expect(calls[0].body.messages).toEqual([{
      role: 'user',
      content: [
        { type: 'text', text: 'What is this?' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,QUJD' } },
      ],
    }]);
  });

  it('leaves a plain-string message completely unchanged', async () => {
    const calls = capture({ choices: [{ message: { content: 'hi' } }] });
    await callAdapter('groq', row('groq'), { messages: [{ role: 'user', content: 'hi' }] });
    expect(calls[0].body.messages).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('refuses a part it does not recognize instead of forwarding it verbatim', async () => {
    const error = await callAdapter('groq', row('groq'), {
      messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'x' } }] }],
    }).catch(e => e);
    expect(error).toBeInstanceOf(AdapterError);
    expect(error.code).toBe('unsupported_content');
  });
});

/* ── gemini: real vision support ─────────────────────────────────────────── */

describe('the gemini adapter — vision', () => {
  it('translates an image part into inlineData with mimeType + data', () => {
    const contents = geminiContentsFrom([{ role: 'user', content: [TEXT_PART, IMAGE_PART] }]);
    expect(contents).toEqual([{
      role: 'user',
      parts: [
        { text: 'What is this?' },
        { inlineData: { mimeType: 'image/png', data: 'QUJD' } },
      ],
    }]);
  });

  it('sends inlineData on the actual wire call too', async () => {
    const calls = capture({
      candidates: [{ content: { parts: [{ text: 'a chart' }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 2 },
    });
    await callAdapter('gemini', row('gemini'), {
      model: 'gemini-2.5-flash',
      messages: [{ role: 'user', content: [IMAGE_PART] }],
    });
    expect(calls[0].body.contents[0].parts).toContainEqual({
      inlineData: { mimeType: 'image/png', data: 'QUJD' },
    });
  });

  it('raises AdapterError, not a crash, on an unrecognized part', () => {
    expect(() => geminiContentsFrom(
      [{ role: 'user', content: [{ type: 'file', url: 'x' }] }],
      { providerId: 'gemini', model: 'gemini-2.5-flash' }
    )).toThrow(AdapterError);
  });
});

/* ── ollama: real vision support ─────────────────────────────────────────── */

describe('the ollama adapter — vision', () => {
  it('translates content-parts into text content + a native images array', async () => {
    const calls = capture({ message: { content: 'a chart' }, prompt_eval_count: 5, eval_count: 2 });
    await callAdapter('ollama', row('ollama'), {
      model: 'llava',
      messages: [{ role: 'user', content: [TEXT_PART, IMAGE_PART] }],
    });
    expect(calls[0].body.messages).toEqual([{
      role: 'user',
      content: 'What is this?',
      images: ['QUJD'],
    }]);
  });

  it('leaves a plain-string message completely unchanged', async () => {
    const calls = capture({ message: { content: 'hi' } });
    await callAdapter('ollama', row('ollama'), { messages: [{ role: 'user', content: 'hi' }] });
    expect(calls[0].body.messages).toEqual([{ role: 'user', content: 'hi' }]);
  });
});

/* ── cohere and cloudflare: no vision — fail loud, never stringify ──────── */

describe('adapters with no image transport refuse loudly', () => {
  it.each([
    ['cohere', {}],
    ['cloudflare', { accountId: 'acct' }],
  ])('%s raises AdapterError(unsupported_content) rather than sending JSON as text', async (providerId, overrides) => {
    axios.post = async () => { throw new Error('should never be called'); };
    const error = await callAdapter(providerId, row(providerId, overrides), {
      model: 'm',
      messages: [{ role: 'user', content: [TEXT_PART, IMAGE_PART] }],
    }).catch(e => e);
    expect(error).toBeInstanceOf(AdapterError);
    expect(error.code).toBe('unsupported_content');
  });

  it.each([
    ['cohere', {}],
    ['cloudflare', { accountId: 'acct' }],
  ])('%s also refuses a part it does not recognize, not just an image', async (providerId, overrides) => {
    const error = await callAdapter(providerId, row(providerId, overrides), {
      model: 'm',
      messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'x' } }] }],
    }).catch(e => e);
    expect(error).toBeInstanceOf(AdapterError);
    expect(error.code).toBe('unsupported_content');
  });

  it('cloudflare still sends plain-string content exactly as before (no regression)', async () => {
    const calls = capture({ result: { response: 'hi' } });
    await callAdapter('cloudflare', row('cloudflare', { accountId: 'acct' }), {
      model: 'm',
      messages: [{ role: 'system', content: 'be brief' }, { role: 'user', content: 'ping' }],
    });
    expect(calls[0].body.messages).toEqual([
      { role: 'system', content: 'be brief' },
      { role: 'user', content: 'ping' },
    ]);
  });

  it('cohere still folds plain-string content into preamble/message exactly as before (no regression)', async () => {
    const calls = capture({ text: 'sunny', meta: { tokens: { input_tokens: 1, output_tokens: 1 } } });
    await callAdapter('cohere', row('cohere'), {
      model: 'm',
      messages: [{ role: 'system', content: 'be brief' }, { role: 'user', content: 'weather?' }],
    });
    expect(calls[0].body.preamble).toBe('be brief');
    expect(calls[0].body.message).toBe('weather?');
  });
});
