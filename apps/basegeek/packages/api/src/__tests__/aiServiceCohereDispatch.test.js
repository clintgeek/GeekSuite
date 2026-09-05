/**
 * aiServiceCohereDispatch.test.js — `callProvider('cohere', ...)` actually
 * reaches `callCohere`.
 *
 * `callCohere` has existed in aiService.js for a long time, but `callProvider`'s
 * switch never had a `case 'cohere'` — every other provider in
 * `config/aiProviders.js` (the single roster) had one. Pinning a `cohere/*`
 * model, or the rotation choosing cohere (it never does — cohere has no
 * `rotationPosition`, see aiProviders.js — but an explicit pin reaches
 * `callProvider` the same way), fell through the switch's `default` and threw
 * `Unknown provider: cohere` even though `this.providers.cohere` was fully
 * configured and `callCohere` was sitting right there, unreachable.
 *
 * This is the tripwire: case dispatch, sampling-param forwarding in Cohere's
 * own spelling, and that a *truly* unknown provider (not in the roster at all)
 * still fails exactly as it always has — that failure is a TypeError reading
 * `.apiKey` off `undefined` in `callProvider`'s own guard, one line before the
 * switch even runs, so it is unaffected by adding the cohere case.
 */

import { describe, it, expect, afterEach } from '@jest/globals';
import http from 'node:http';

const { default: aiService } = await import('../services/aiService.js');
const { default: aiModelCapabilitiesService } = await import('../services/aiModelCapabilitiesService.js');

const patched = [];
function patch(obj, key, value) {
  patched.push([obj, key, obj[key]]);
  obj[key] = value;
  return value;
}

afterEach(() => {
  while (patched.length) {
    const [obj, key, original] = patched.pop();
    obj[key] = original;
  }
});

/** A local HTTP server standing in for Cohere, capturing the request body. */
async function captureServer(respond) {
  const captured = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      let parsed = null;
      try { parsed = JSON.parse(body); } catch { /* leave null */ }
      captured.push({ url: req.url, headers: req.headers, body: parsed });
      const out = respond(parsed, req);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    captured,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

describe('callProvider dispatches cohere', () => {
  it('routes provider "cohere" to callCohere, hitting the real Cohere endpoint shape', async () => {
    const srv = await captureServer(() => ({
      text: 'It is sunny in Paris.',
      meta: { tokens: { input_tokens: 6, output_tokens: 5 } },
    }));
    patch(aiService, 'providers', {
      ...aiService.providers,
      cohere: { ...aiService.providers.cohere, apiKey: 'test', baseURL: srv.url, model: 'command-r-plus-08-2024' },
    });
    try {
      const result = await aiService.callProvider('cohere', 'weather?', {
        messages: [{ role: 'user', content: 'weather?' }],
      });

      expect(srv.captured).toHaveLength(1);
      expect(srv.captured[0].url).toBe('/chat');
      expect(srv.captured[0].body.model).toBe('command-r-plus-08-2024');
      expect(srv.captured[0].body.message).toBe('weather?');
      expect(result.content).toBe('It is sunny in Paris.');
      expect(result.inputTokens).toBe(6);
      expect(result.outputTokens).toBe(5);
    } finally {
      await srv.close();
    }
  });

  it('forwards topP/stop/seed/penalties in Cohere\'s own spelling', async () => {
    const srv = await captureServer(() => ({ text: 'ok', meta: { tokens: { input_tokens: 1, output_tokens: 1 } } }));
    patch(aiService, 'providers', {
      ...aiService.providers,
      cohere: { ...aiService.providers.cohere, apiKey: 'test', baseURL: srv.url, model: 'command-r-plus-08-2024' },
    });
    try {
      await aiService.callProvider('cohere', 'hi', {
        messages: [{ role: 'user', content: 'hi' }],
        topP: 0.5,
        stop: ['\n\n', 'END'],
        seed: 42,
        presencePenalty: 0.2,
        frequencyPenalty: 0.3,
      });

      const body = srv.captured[0].body;
      // Cohere's own spelling: p (not top_p), stop_sequences (not stop),
      // seed/presence_penalty/frequency_penalty unchanged from OpenAI's.
      expect(body.p).toBe(0.5);
      expect(body.stop_sequences).toEqual(['\n\n', 'END']);
      expect(body.seed).toBe(42);
      expect(body.presence_penalty).toBe(0.2);
      expect(body.frequency_penalty).toBe(0.3);
      expect(body.top_p).toBeUndefined();
      expect(body.stop).toBeUndefined();
    } finally {
      await srv.close();
    }
  });

  it('does not forward tools to Cohere, and the capability matrix agrees it cannot', async () => {
    const srv = await captureServer(() => ({ text: 'ok', meta: { tokens: { input_tokens: 1, output_tokens: 1 } } }));
    patch(aiService, 'providers', {
      ...aiService.providers,
      cohere: { ...aiService.providers.cohere, apiKey: 'test', baseURL: srv.url, model: 'command-r-plus-08-2024' },
    });
    try {
      await aiService.callProvider('cohere', 'weather?', {
        messages: [{ role: 'user', content: 'weather?' }],
        tools: [{ type: 'function', function: { name: 'get_weather', description: 'x', parameters: { type: 'object', properties: {} } } }],
        toolChoice: 'auto',
      });
      expect(srv.captured[0].body.tools).toBeUndefined();
    } finally {
      await srv.close();
    }

    // The capability matrix must not promise what the adapter above just
    // proved it does not deliver — regardless of what supportsFunctionCalling
    // says about the underlying model.
    expect(aiModelCapabilitiesService.supportsTools('cohere', 'command-r-plus-08-2024')).toBe(false);
    expect(aiModelCapabilitiesService.supportsTools('cohere', 'command-r')).toBe(false);
  });

  it('an unknown provider still fails the way it does today (not a switch case gap)', async () => {
    // aiService.providers has no such key at all, so callProvider's own guard
    // — `if (!providerConfig.apiKey)` — throws reading .apiKey off undefined
    // before the switch is ever reached. This is unrelated to (and unaffected
    // by) the cohere case added above: it was true before that fix and stays
    // true after.
    expect(aiService.providers.definitelyNotAProvider).toBeUndefined();
    await expect(aiService.callProvider('definitelyNotAProvider', 'hi', {}))
      .rejects.toThrow(/Cannot read propert/);
  });
});
