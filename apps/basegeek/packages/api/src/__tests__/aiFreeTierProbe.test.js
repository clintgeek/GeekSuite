/**
 * aiFreeTierProbe.test.js — `scripts/probe-free-tier.js`, without a network.
 *
 * The probe's only load-bearing judgement is `classifyProbeOutcome`: dead means
 * "retrying tomorrow changes nothing", unknown means "the provider was having a
 * bad minute". Get that wrong in the pessimistic direction and `--mark` buries
 * a working model for thirty days; get it wrong the other way and the dead rows
 * this whole stream exists to fix stay in the rotation.
 *
 * The four strings below are the real ones from the 2026-09-06 log, verbatim in
 * shape (bodies elided): Groq's retired model, Cerebras' refused key,
 * Together's no-longer-serverless model and OpenRouter's recycled `:free` slug.
 *
 * It also pins the two things that must never reach a terminal: a provider's
 * body beyond the character cap, and anything key-shaped at all.
 */

import { describe, it, expect } from '@jest/globals';

const probe = await import('../../scripts/probe-free-tier.js');

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

/* ── argument parsing ─────────────────────────────────────────────────────── */

describe('parseArgs', () => {
  it('defaults to report only', () => {
    const opts = probe.parseArgs([]);
    expect(opts.mark).toBe(false);
    expect(opts.revive).toBe(false);
    expect(opts.timeout).toBe(probe.DEFAULT_PROBE_TIMEOUT_MS);
  });

  it('takes --mark, --revive, --provider and --timeout', () => {
    const opts = probe.parseArgs(['--mark', '--revive', '--provider', 'GROQ', '--timeout', '12000']);
    expect(opts).toMatchObject({ mark: true, revive: true, provider: 'groq', timeout: 12000 });
  });

  it('refuses an unknown flag and a silly timeout', () => {
    expect(() => probe.parseArgs(['--delete-dead-rows'])).toThrow(/Unknown option/);
    expect(() => probe.parseArgs(['--timeout', '10'])).toThrow(/at least 500/);
  });
});

/* ── the run ──────────────────────────────────────────────────────────────── */

const ROWS = [
  { provider: 'groq', modelId: 'llama-3.1-8b-instant' },
  { provider: 'cerebras', modelId: 'llama3.1-8b' },
  { provider: 'cloudflare', modelId: '@cf/meta/llama-3.1-8b-instruct' },
];

function layer(answers) {
  const calls = [];
  return {
    calls,
    callProvider: async (provider, prompt, config) => {
      calls.push({ provider, model: config.model, maxTokens: config.maxTokens, prompt });
      const answer = answers[`${provider}/${config.model}`];
      if (answer instanceof Error) throw answer;
      return { content: 'OK', inputTokens: 3, outputTokens: 1 };
    },
  };
}

describe('runProbe', () => {
  it('asks for one token and reports a row per model', async () => {
    const { calls, callProvider } = layer({
      'groq/llama-3.1-8b-instant': REAL_FAILURES[0].error,
      'cerebras/llama3.1-8b': REAL_FAILURES[1].error,
    });

    const results = await probe.runProbe({ rows: ROWS, callProvider });

    expect(calls.every(c => c.maxTokens === 1)).toBe(true);
    expect(calls.every(c => c.prompt === 'Reply OK')).toBe(true);
    expect(results.map(r => r.status)).toEqual(['dead', 'dead', 'alive']);
  });

  it('writes nothing without --mark or --revive', async () => {
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

  it('--mark cools a dead row for 30 days and leaves an unknown one alone', async () => {
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
    // Deliberately no $unset / deleteOne anywhere — the aiGeek UI lists these
    // rows and a vanished row reads as a config loss.
    expect(writes[0].update.$unset).toBeUndefined();
  });

  it('--revive clears cooling on a row that answered', async () => {
    const { callProvider } = layer({});
    const writes = [];
    await probe.runProbe({
      rows: [ROWS[2]],
      callProvider,
      updateOne: async (query, update) => { writes.push({ query, update }); },
      options: { revive: true },
    });
    expect(writes).toHaveLength(1);
    expect(writes[0].update.$set['health.coolingUntil']).toBeNull();
    expect(writes[0].update.$set['health.consecutiveFailures']).toBe(0);
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
      { provider: 'cloudflare', modelId: '@cf/meta/llama-3.1-8b-instruct', status: 'alive', code: 'ok', ms: 640, message: '' },
    ];
    const lines = probe.renderTable(results);
    const text = lines.join('\n');

    expect(text).toContain('llama-3.1-8b-instant');
    expect(text).toContain('http_404');
    // The elided provider body: the head survives, the tail does not.
    expect(text).not.toContain('you do not have access to it');
    for (const outLine of lines) {
      expect(outLine.length).toBeLessThanOrEqual(120);
    }
  });
});
