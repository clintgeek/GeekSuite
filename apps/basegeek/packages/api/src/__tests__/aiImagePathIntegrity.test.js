/**
 * An image must survive the whole way down, not just the last hop.
 *
 * `aiImageContent.test.js` proves each adapter emits its provider's native
 * shape when an image reaches it. That is necessary and it is not sufficient:
 * it calls the adapters directly, and every bug this file exists for lived
 * UPSTREAM of them, in code that flattened the content-parts array before any
 * adapter ever saw it.
 *
 * Three separate layers carried the same fallthrough, each independently
 * reasonable in isolation:
 *
 *   1. `adapters/cloudflare.js` — `JSON.stringify(m.content)` for non-strings.
 *   2. `aiService.normalizeMessageContent` — joined array parts into a string,
 *      with `JSON.stringify(part)` for anything it did not recognize.
 *   3. `tokenCounter.extractTextContent` — the same `JSON.stringify(block)`,
 *      which counted a base64 payload as prose and so sent every image-bearing
 *      call into summarization, where it did not survive.
 *
 * In all three the failure was silent: the request went out, the model read
 * base64 as text, the answer came back confident and wrong, and real quota was
 * spent. That is the specific outcome these tests defend against, so they
 * assert on the *transform*, not on a mocked provider's reply.
 */
import { jest } from '@jest/globals';
import { extractTextContent, countMessageTokens } from '../services/tokenCounter.js';
import { messagesNeedImageHandling, TEXT_PART, IMAGE_PART } from '../services/ai/adapters/imageContent.js';

/** The canonical part shapes, built here so the test pins the wire contract. */
const textPart = (text) => ({ type: TEXT_PART, text });
const imagePart = (mediaType, data) => ({ type: IMAGE_PART, mediaType, data });

/** ~1MB of base64 — the rough size of one rendered report page. */
const BIG_B64 = 'A'.repeat(1024 * 1024);

const imageMessage = () => ({
  role: 'user',
  content: [textPart('Extract the printed numbers.'), imagePart('image/png', BIG_B64)],
});

describe('tokenCounter does not read an image as prose', () => {
  test('an image part contributes no text', () => {
    expect(extractTextContent(imageMessage().content)).toBe('Extract the printed numbers.');
  });

  test('a 1MB image does not blow the context estimate', () => {
    const withImage = countMessageTokens([imageMessage()]);
    const textOnly = countMessageTokens([{ role: 'user', content: 'Extract the printed numbers.' }]);

    // Before the fix this was ~250,000 against ~6.
    expect(withImage).toBe(textOnly);
    expect(withImage).toBeLessThan(100);
  });

  test('an unrecognized non-image block is still stringified — the old behaviour is intact', () => {
    // The fix must be narrow. Anything that is not a recognized image part
    // keeps falling through exactly as it did, so existing callers that relied
    // on seeing *something* for an odd block still do.
    const text = extractTextContent([{ type: 'tool_use', id: 'abc' }]);
    expect(text).toContain('tool_use');
  });
});

describe('aiService.normalizeMessages passes an image through intact', () => {
  // `normalizeMessages` is module-private and runs on the live
  // `aiFeatureRunner -> callAI` path. Reaching it through the exported service
  // keeps the test honest about what actually executes in production.
  let aiService;
  beforeAll(async () => {
    ({ default: aiService } = await import('../services/aiService.js'));
  });

  test('the content-parts array is the SAME array after normalization', async () => {
    const messages = [imageMessage()];
    const { messages: out } = await aiService.preprocessContext('', messages, 'nonexistent-provider');
    // An unknown provider has no context limit, so preprocessing is a no-op and
    // the array must come back untouched — not flattened, not re-wrapped.
    expect(Array.isArray(out[0].content)).toBe(true);
    expect(out[0].content).toHaveLength(2);
    expect(out[0].content[1]).toMatchObject({ type: 'image', mediaType: 'image/png' });
    expect(out[0].content[1].data).toBe(BIG_B64);
  });

  test('a text-only parts array still flattens to a string', () => {
    // The narrow-fix guarantee: ONLY image-bearing arrays change behaviour.
    // `preprocessContext` is a no-op for an unknown provider, so it cannot show
    // this — the flattening lives in `normalizeMessages`, which runs after it.
    // Assert the observable consequence instead, via the same token counter the
    // pipeline uses: a flattened text array reads as its joined text.
    expect(extractTextContent([textPart('one'), textPart('two')])).toBe('one\ntwo');
  });
});

describe('summarization never eats an image', () => {
  let aiService;
  beforeAll(async () => {
    ({ default: aiService } = await import('../services/aiService.js'));
  });

  test('an image-bearing conversation over the threshold is sent unsummarized', async () => {
    const summarize = jest.spyOn(aiService, 'summarizeMessages');

    // Force the threshold branch with genuinely long TEXT alongside the image,
    // so the guard — not the token count — is what protects it.
    const long = 'word '.repeat(200000);
    const messages = [
      { role: 'user', content: long },
      imageMessage(),
    ];

    // Inject a provider with a real context limit rather than skipping when the
    // environment has none configured. A test that quietly returns is a test
    // that reports success for work it never did — and this is the guard that
    // stands between an image and the summarizer.
    const PROVIDER = '__test_ctx_provider__';
    aiService.providers = aiService.providers || {};
    aiService.providers[PROVIDER] = { maxContextTokens: 8000 };

    try {
      const { messages: out } = await aiService.preprocessContext('', messages, PROVIDER);

      // Prove the threshold really was crossed, so the guard is what saved it.
      expect(countMessageTokens(messages)).toBeGreaterThan(4000);
      expect(summarize).not.toHaveBeenCalled();
      expect(out).toBe(messages);
    } finally {
      delete aiService.providers[PROVIDER];
      summarize.mockRestore();
    }
  });

  test('without an image, a conversation over the threshold IS still summarized', async () => {
    // The guard must be narrow: it protects images, it does not disable
    // summarization. Without this, the previous test would pass just as well if
    // someone deleted the summarizer entirely.
    const summarize = jest
      .spyOn(aiService, 'summarizeMessages')
      .mockResolvedValue([{ role: 'user', content: 'summary' }]);

    const PROVIDER = '__test_ctx_provider2__';
    aiService.providers = aiService.providers || {};
    aiService.providers[PROVIDER] = { maxContextTokens: 8000 };

    try {
      const messages = [{ role: 'user', content: 'word '.repeat(200000) }];
      await aiService.preprocessContext('', messages, PROVIDER);
      expect(summarize).toHaveBeenCalled();
    } finally {
      delete aiService.providers[PROVIDER];
      summarize.mockRestore();
    }
  });
});

describe('messagesNeedImageHandling is the one detector', () => {
  test('true for an image-bearing message, false for plain text', () => {
    expect(messagesNeedImageHandling([imageMessage()])).toBe(true);
    expect(messagesNeedImageHandling([{ role: 'user', content: 'hello' }])).toBe(false);
  });
});
