/**
 * aiFreeTierProbe.test.js — the probe's judgement, without a network.
 *
 * Migrated 2026-09-07 from `scripts/probe-free-tier.js` to
 * `src/services/aiCatalogDiscovery.js`. The script is now a CLI wrapper; the
 * judgement is a service, because `aiCatalogJob` runs the same one every six
 * hours.
 *
 * The probe has two load-bearing judgements and they fail in opposite
 * directions:
 *
 *   `classifyProbeOutcome` — dead means "retrying tomorrow changes nothing",
 *   unknown means "the provider was having a bad minute". Wrong pessimistically
 *   and `--mark` buries a working model for thirty days; wrong the other way
 *   and the dead rows this whole stream exists to fix stay in the rotation.
 *
 *   `classifyProbe` — the *fitness* half, new in Phase 1. It replaced a 30-term
 *   regex over model ids (`NOT_GENERAL`) that decided which models were
 *   "general assistants" by their names. Nothing is excluded for being small
 *   now; a model that answers with parseable JSON outranks one that answers
 *   with prose, and both are kept. Wrong here and the ranking is wrong, which
 *   costs a retry — a far cheaper failure than exclusion by regex.
 *
 * The four error strings below are the real ones from the 2026-09-06 log,
 * verbatim in shape (bodies elided): Groq's retired model, Cerebras' refused
 * key, Together's no-longer-serverless model and OpenRouter's recycled `:free`
 * slug.
 *
 * It also pins the two things that must never reach a terminal: a provider's
 * body beyond the character cap, and anything key-shaped at all.
 */

import { describe, it, expect } from '@jest/globals';

const probe = await import('../services/aiCatalogDiscovery.js');

/* ── the four real failures ───────────────────────────────────────────────── */

const REAL_FAILURES = [
  {
    what: 'groq retired the model',
    error: new Error('Groq API error (404): {"error":{"message":"The model `llama-3.1-8b-instant` does not exist or you do not have access to it.","type":"invalid_request_error","code":"model_not_found"}}'),
    code: 'http_404',
  },
  {
    what: 'cerebras refused the key',
    error: new Error('Cerebras API error (401): {"message":"Wrong API Key","type":"authentication_error"}'),
    code: 'http_401',
  },
  {
    what: 'together stopped serving the -Free variant',
    error: new Error('Together API error (400): {"error":{"message":"Unable to access model meta-llama/Llama-3.3-70B-Instruct-Turbo-Free"}}'),
    code: 'http_400',
  },
  {
    what: 'openrouter recycled the :free slug',
    error: new Error('OpenRouter API error (404): {"error":{"message":"No endpoints found for meta-llama/llama-3.1-8b-instruct:free","code":404}}'),
    code: 'http_404',
  },
];

describe('classifyProbeOutcome maps the real failures to dead', () => {
  for (const { what, error, code } of REAL_FAILURES) {
    it(`${what} → dead (${code})`, () => {
      const outcome = probe.classifyProbeOutcome(error);
      expect(outcome.status).toBe('dead');
      expect(outcome.code).toBe(code);
    });
  }

  it('a returned call is alive', () => {
    expect(probe.classifyProbeOutcome(null)).toEqual({ status: 'alive', code: 'ok', http: null });
  });

  it('reads the vendors words when there is no status to read', () => {
    // Not every adapter has an `error.response`; a raw SDK/network error only
    // carries a message, and the words are the same four situations.
    expect(probe.classifyProbeOutcome(new Error('model_not_found')).status).toBe('dead');
    expect(probe.classifyProbeOutcome(new Error('The model does not exist')).status).toBe('dead');
    expect(probe.classifyProbeOutcome(new Error('this model is no longer available')).status).toBe('dead');
    expect(probe.classifyProbeOutcome(new Error('Wrong API Key')).status).toBe('dead');
    expect(probe.classifyProbeOutcome(new Error('unauthorized')).status).toBe('dead');
  });
});

describe('classifyProbeOutcome refuses to call a bad minute a death', () => {
  const soft = [
    ['a 429', new Error('Groq API error (429): {"error":"rate limit reached"}'), 'http_429'],
    ['a 500', new Error('Together API error (500): {}'), 'http_500'],
    ['a 503', new Error('Cloudflare API error (503): {}'), 'http_503'],
    ['the probe timeout', new Error('probe timeout after 8000ms'), 'timeout'],
    ['a refused socket', new Error('connect ECONNREFUSED 127.0.0.1:443'), 'network'],
    ['a DNS miss', new Error('getaddrinfo ENOTFOUND api.example.invalid'), 'network'],
  ];
  for (const [what, error, code] of soft) {
    it(`${what} → unknown (${code})`, () => {
      const outcome = probe.classifyProbeOutcome(error);
      expect(outcome.status).toBe('unknown');
      expect(outcome.code).toBe(code);
    });
  }
});

/* ── the fitness classification (replaces the NOT_GENERAL cases) ─────────── */

const GOOD_JSON = '{"task":"Call the vet","day":"Friday","time":"3pm","tag":"flock"}';

describe('classifyProbe: parseable JSON is structured', () => {
  it('takes bare JSON with string task and day', () => {
    expect(probe.classifyProbe({ content: GOOD_JSON }))
      .toMatchObject({ status: 'alive', fitness: 'structured', code: 'ok' });
  });

  it('strips a markdown fence — most free models still send one', () => {
    for (const fenced of [
      '```json\n' + GOOD_JSON + '\n```',
      '```\n' + GOOD_JSON + '\n```',
    ]) {
      expect(probe.classifyProbe({ content: fenced }).fitness).toBe('structured');
    }
  });

  it('unwraps a one-key envelope — Cloudflare llama 3.3 does exactly this', () => {
    expect(probe.classifyProbe({ content: `{"Extract":${GOOD_JSON}}` }).fitness).toBe('structured');
    expect(probe.classifyProbe({ content: `{"output":${GOOD_JSON}}` }).fitness).toBe('structured');
  });

  it('digs the object out of surrounding prose', () => {
    expect(probe.classifyProbe({ content: `Sure! Here you go: ${GOOD_JSON} Hope that helps.` }).fitness)
      .toBe('structured');
  });

  it('needs task AND day, both non-empty strings', () => {
    // JSON is not enough: an object that answered a different question is a
    // model that talks, not one that extracts.
    expect(probe.classifyProbe({ content: '{"task":"Call the vet"}' }).fitness).toBe('basic');
    expect(probe.classifyProbe({ content: '{"task":"Call the vet","day":""}' }).fitness).toBe('basic');
    expect(probe.classifyProbe({ content: '{"task":"Call the vet","day":3}' }).fitness).toBe('basic');
    expect(probe.classifyProbe({ content: '{"result":"ok"}' }).fitness).toBe('basic');
    expect(probe.classifyProbe({ content: '[1,2,3]' }).fitness).toBe('basic');
  });
});

describe('classifyProbe: text that is not JSON is basic, not dead', () => {
  it('keeps a model that answers in prose, ranked lower', () => {
    const outcome = probe.classifyProbe({ content: 'Call the vet on Friday at 3pm, tagged #flock.' });
    expect(outcome).toMatchObject({ status: 'alive', fitness: 'basic', code: 'ok' });
  });

  it('keeps the models the old name regex threw away', () => {
    // `minimax-m2:free`, `groq/compound`, `gemma-3-27b` and every other id with
    // a size or a `:free` suffix used to be excluded before they were ever
    // called. Behaviour decides now, and prose is a pass.
    expect(probe.classifyProbe({ content: 'ok' }).status).toBe('alive');
  });
});

describe('classifyProbe: HTTP 200 with no text is dead', () => {
  it('calls empty content dead, whatever shape the emptiness takes', () => {
    // gpt-oss through the Cloudflare and Ollama adapters, 2026-09-06: a 200
    // with nothing in it. Nothing downstream can use it, so it is not alive.
    for (const content of ['', '   ', '\n\n', null, undefined]) {
      expect(probe.classifyProbe({ content })).toMatchObject({ status: 'dead', code: 'empty_content', fitness: null });
    }
    expect(probe.classifyProbe(null)).toMatchObject({ status: 'dead', code: 'empty_content' });
  });

  it('an error still wins over the content, and carries no fitness', () => {
    const outcome = probe.classifyProbe({ content: GOOD_JSON }, REAL_FAILURES[0].error);
    expect(outcome).toMatchObject({ status: 'dead', code: 'http_404', fitness: null });
  });
});

/* ── the run ──────────────────────────────────────────────────────────────── */

const ROWS = [
  { provider: 'groq', modelId: 'llama-3.1-8b-instant' },
  { provider: 'cerebras', modelId: 'llama3.1-8b' },
  { provider: 'cloudflare', modelId: '@cf/meta/llama-3.1-8b-instruct' },
];

function layer(answers, { content = GOOD_JSON } = {}) {
  const calls = [];
  return {
    calls,
    callProvider: async (provider, prompt, config) => {
      calls.push({ provider, model: config.model, maxTokens: config.maxTokens, temperature: config.temperature, prompt, messages: config.messages });
      const answer = answers[`${provider}/${config.model}`];
      if (answer instanceof Error) throw answer;
      return { content: answer ?? content, inputTokens: 3, outputTokens: 12 };
    },
  };
}

describe('runProbe', () => {
  it('sends the structured extraction with a 48-token budget at temperature 0', async () => {
    const { calls, callProvider } = layer({
      'groq/llama-3.1-8b-instant': REAL_FAILURES[0].error,
      'cerebras/llama3.1-8b': REAL_FAILURES[1].error,
    });

    const results = await probe.runProbe({ rows: ROWS, callProvider });

    expect(calls.every(c => c.maxTokens === probe.PROBE_MAX_TOKENS)).toBe(true);
    expect(probe.PROBE_MAX_TOKENS).toBe(48);
    expect(calls.every(c => c.temperature === 0)).toBe(true);
    // System + user, so the adapters that only take `messages` see the same
    // instruction as the ones that take a prompt.
    expect(calls.every(c => c.messages[0].content === probe.PROBE_SYSTEM)).toBe(true);
    expect(calls.every(c => c.messages[1].content === probe.PROBE_USER)).toBe(true);
    expect(calls.every(c => c.prompt === probe.PROBE_USER)).toBe(true);
    // Nothing about the request is user data.
    expect(probe.PROBE_USER).toMatch(/Call the vet Friday at 3pm/);

    expect(results.map(r => r.status)).toEqual(['dead', 'dead', 'alive']);
    expect(results[2].fitness).toBe('structured');
  });

  it('writes nothing without mark or revive', async () => {
    const { callProvider } = layer({ 'groq/llama-3.1-8b-instant': REAL_FAILURES[0].error });
    const writes = [];
    const results = await probe.runProbe({
      rows: ROWS,
      callProvider,
      updateOne: null,
      options: { mark: false, revive: false },
    });
    expect(writes).toEqual([]);
    expect(results.every(r => r.marked === null)).toBe(true);
  });

  it('mark cools a dead row for 30 days and leaves an unknown one alone', async () => {
    const now = Date.UTC(2026, 8, 6, 22, 15, 0);
    const { callProvider } = layer({
      'groq/llama-3.1-8b-instant': REAL_FAILURES[0].error,
      'cerebras/llama3.1-8b': new Error('Cerebras API error (503): {}'),
    });
    const writes = [];
    await probe.runProbe({
      rows: ROWS,
      callProvider,
      updateOne: async (query, update) => { writes.push({ query, update }); },
      options: { mark: true, now },
    });

    expect(writes).toHaveLength(1);
    expect(writes[0].query).toEqual({ provider: 'groq', modelId: 'llama-3.1-8b-instant' });
    const set = writes[0].update.$set;
    expect(set['health.lastFailureCode']).toBe('http_404');
    expect(set['health.coolingUntil'].getTime() - now).toBe(probe.PROBE_MARK_COOLDOWN_MS);
    expect(set.probedAt.getTime()).toBe(now);
    // Deliberately no $unset / deleteOne anywhere — the aiGeek UI lists these
    // rows and a vanished row reads as a config loss.
    expect(writes[0].update.$unset).toBeUndefined();
  });

  it('revive clears cooling and records the fitness it just measured', async () => {
    const now = Date.UTC(2026, 8, 7, 3, 0, 0);
    const { callProvider } = layer({});
    const writes = [];
    await probe.runProbe({
      rows: [ROWS[2]],
      callProvider,
      updateOne: async (query, update) => { writes.push({ query, update }); },
      options: { revive: true, now },
    });
    expect(writes).toHaveLength(1);
    const set = writes[0].update.$set;
    expect(set['health.coolingUntil']).toBeNull();
    expect(set['health.consecutiveFailures']).toBe(0);
    expect(set.isFree).toBe(true);
    expect(set.fitness).toBe('structured');
    expect(set.probedAt.getTime()).toBe(now);
  });

  it('records basic fitness for a row that answered in prose', async () => {
    const { callProvider } = layer({ 'cloudflare/@cf/meta/llama-3.1-8b-instruct': 'Call the vet Friday.' });
    const writes = [];
    await probe.runProbe({
      rows: [ROWS[2]],
      callProvider,
      updateOne: async (query, update) => { writes.push({ query, update }); },
      options: { revive: true },
    });
    expect(writes[0].update.$set.fitness).toBe('basic');
    expect(writes[0].update.$set.isFree).toBe(true);
  });

  it('gives up on a hung provider inside the timeout', async () => {
    const results = await probe.runProbe({
      rows: [ROWS[0]],
      callProvider: () => new Promise(() => {}),
      options: { timeout: 60 },
    });
    expect(results[0].status).toBe('unknown');
    expect(results[0].code).toBe('timeout');
  });

  it('probes sequentially — a parallel fan-out trips the limits it is measuring', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    await probe.runProbe({
      rows: ROWS,
      callProvider: async () => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise(r => setTimeout(r, 5));
        inFlight--;
        return { content: GOOD_JSON };
      },
    });
    expect(maxInFlight).toBe(1);
  });
});

/* ── nothing sensitive reaches the terminal ───────────────────────────────── */

describe('the printed table is safe to paste', () => {
  it('truncates provider text at the cap', () => {
    const long = 'x'.repeat(500);
    expect(probe.safeErrorText(long).length).toBe(probe.ERROR_TEXT_LIMIT);
    expect(probe.safeErrorText(long, probe.ERROR_TEXT_LIMIT_DETAIL).length)
      .toBe(probe.ERROR_TEXT_LIMIT_DETAIL);
    expect(probe.safeErrorText('short')).toBe('short');
  });

  it('renders a table whose every line is bounded and carries no body', () => {
    const results = [
      { provider: 'groq', modelId: 'llama-3.1-8b-instant', status: 'dead', code: 'http_404', ms: 210, message: REAL_FAILURES[0].error.message },
      { provider: 'cloudflare', modelId: '@cf/meta/llama-3.1-8b-instruct', status: 'alive', fitness: 'structured', code: 'ok', ms: 640, message: '' },
    ];
    const lines = probe.renderTable(results);
    const text = lines.join('\n');

    expect(text).toContain('llama-3.1-8b-instant');
    expect(text).toContain('http_404');
    expect(text).toContain('structured');
    // The elided provider body: the head survives, the tail does not.
    expect(text).not.toContain('you do not have access to it');
    for (const outLine of lines) {
      expect(outLine.length).toBeLessThanOrEqual(120);
    }
  });
});
