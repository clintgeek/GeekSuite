/**
 * imageContent — the provider-neutral shape for an image attached to a chat
 * message, and the helpers every adapter uses to read it.
 *
 * Built for FitnessGeek's body-composition intake (DOCS/BODY_COMPOSITION_INTAKE.md):
 * a scan (a rendered PDF page, or a photo) has to travel from the app,
 * through aiGeek's front door, to whichever vision-capable provider the
 * `need: 'vision:*'` resolver picked — without the caller ever naming that
 * provider. This file is the one place that shape is defined, so it is
 * defined exactly once.
 *
 * ── The shape ────────────────────────────────────────────────────────────
 *
 * `messages[].content` keeps working exactly as it always has when it is a
 * plain string. Nothing about a text-only caller changes: no new field to
 * set, no adapter branch it can hit that it could not hit before.
 *
 * To attach an image, `content` becomes an array of parts instead of a bare
 * string:
 *
 *   content: [
 *     { type: 'text',  text: 'What does this scan say?' },
 *     { type: 'image', mediaType: 'image/png', data: '<base64, no data: URI prefix>' }
 *   ]
 *
 * `mediaType` is the caller's own declared IANA media type — `image/png`,
 * `image/jpeg`, `image/webp`. It is a declaration, not a promise the bytes
 * behind it were sniffed (BODY_COMPOSITION_INTAKE.md §4 is why the *frontend*
 * must sniff rather than trust a file extension; this layer trusts whatever
 * mediaType the caller declares and each adapter's own validation is what
 * catches a wrong one). `data` is raw base64 with no `data:` URI wrapper —
 * each provider dialect builds its own wrapper, or none at all (Gemini,
 * Ollama), so a stored prefix would just be stripped by the first adapter
 * that read it.
 *
 * This shape is deliberately NOT any one provider's dialect. OpenAI's is
 * `{type:'image_url', image_url:{url:'data:...'}}`; Gemini's is
 * `{inlineData:{mimeType, data}}`; Ollama's is a bare base64 string on a
 * message-level `images` array. All three are translated FROM this shape, in
 * the adapter that speaks that dialect — never authored by a caller. A
 * caller (aiGeekClient, or whatever eventually calls the front door)
 * writing a provider's own field name would be exactly the leak the front
 * door exists to prevent (see aiGeekClient.js's header, rule 2).
 *
 * ── Why this lives in `content`, not a new top-level field ────────────────
 *
 * `messages` already passes unread, byte-for-byte, through every layer
 * between a caller and an adapter — `aiGeekClient.feature()` forwards
 * `payload.messages` verbatim, `POST /api/ai/feature` forwards `req.body.
 * messages` verbatim, and `aiFeatureRunner.runFeatureCore` forwards its
 * `messages` opt verbatim into `aiService.callAI`. A new top-level field
 * (`images`, `attachments`) would have needed a matching change at every one
 * of those hops AND inside `aiService.callAI`/`callProvider`, which build
 * their downstream `request` object from a fixed, named list of fields and
 * silently drop anything not on it. Content-parts need none of that: they
 * ride inside a field that was already opaque cargo the whole way down.
 *
 * ── The one place this does NOT survive intact ────────────────────────────
 *
 * `aiService.js` (`normalizeMessageContent`, ~line 93) runs on the `callAI`
 * path — the one `aiFeatureRunner`/the HTTP front door actually uses — and
 * flattens ANY array `content` into a joined string, `JSON.stringify`-ing
 * any part that is not `{type:'text', ...}`. An image part matches neither
 * `part.text` nor `part.type === 'text'`, so it would be JSON-stringified
 * into the "text" the model reads — the exact failure this whole feature
 * exists to prevent, just relocated one file upstream of the adapters this
 * module was scoped to fix. `aiService.js` is outside this task's file
 * scope; see the delivery report for the one-function fix it needs
 * (teach `normalizeMessageContent` to recognize and pass through a
 * content-parts array built from this shape, exactly as `partsOf` below
 * does, instead of flattening it).
 *
 * Adapters reached directly — `aiService.callProvider` / `services/ai/
 * adapters/index.js#callAdapter`, which is how `aiCloudflareAdapter.test.js`
 * and `aiAdapters.test.js` already exercise every adapter, and how a caller
 * with an explicit pin can reach a provider without the `callAI` routing
 * walk — see the shape exactly as written above, untouched.
 */

/** The two part types this suite understands. Anything else is `unrecognized`. */
export const TEXT_PART = 'text';
export const IMAGE_PART = 'image';

/** IANA media types the front door accepts for an attached image. Raster only
 *  — a PDF page becomes one of these before it reaches this layer; converting
 *  a PDF to an image is a different piece of the intake pipeline
 *  (BODY_COMPOSITION_INTAKE.md §9, piece 4, not yet built) and out of scope
 *  here. */
export const ALLOWED_IMAGE_MEDIA_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

/**
 * The front door's size and count budget for attached images, enforced by
 * `validateImageBudget` in `routes/aiRoutes.js` before a call is ever
 * attempted.
 *
 * BODY_COMPOSITION_INTAKE.md §4: a rendered PDF page runs roughly 400-600 KB
 * before base64 and ~35% larger after — call it ~550-810 KB base64 for the
 * common case. The same doc's §4 also describes the outlier: a tall
 * screenshot report that "cannot be sent as a single image" and had to be
 * sliced into 8 chunks to read. `MAX_IMAGES_PER_REQUEST` exists for exactly
 * that shape of request; `MAX_IMAGE_BASE64_BYTES` is sized for a single
 * outsized photo (a phone camera JPEG can run several MB) rather than for
 * the common PDF-page case, which sits far under it.
 *
 * These are independent of, and tighter than, the Express JSON body limit
 * that wraps `/api/ai/feature` (`AI_BODY_LIMIT`, default 8 MB, set in
 * `server.js` — outside this task's file scope). That limit is the outer,
 * blunt backstop: it 413s the whole request before a route handler ever
 * runs. These constants exist so the *common* failure — one absurdly large
 * image, or too many of them — gets a clear, specific 400 instead of either
 * silently succeeding into a slow/expensive model call or falling through to
 * Express's generic body-too-large response.
 *
 * These budgets are therefore sized to fit INSIDE `AI_BODY_LIMIT` (8 MB by
 * default), not the other way round. That limit is not an arbitrary number to
 * raise for convenience: `server.js` explains it was set after an
 * unauthenticated POST had a 50 MB body buffered and JSON-parsed into heap —
 * then tiktoken'd and md5'd on the event loop — before anything checked
 * `Authorization`. Widening it to make room for images would trade a real
 * denial-of-service mitigation for a convenience, so the caps come down
 * instead and leave headroom for the surrounding JSON and prompt.
 *
 * There is room to spare for the actual workload: a rendered report page is
 * ~550 KB base64 (BODY_COMPOSITION_INTAKE.md §4), and the worst case — the
 * tall screenshot sliced into 8 — lands around 2 MB in total.
 */
export const MAX_IMAGE_BASE64_BYTES = 4 * 1024 * 1024; // ~3MB raw per image
export const MAX_IMAGES_PER_REQUEST = 8; // BODY_COMPOSITION_INTAKE.md §4
export const MAX_TOTAL_IMAGE_BASE64_BYTES = 6 * 1024 * 1024; // the whole batch, inside AI_BODY_LIMIT

/**
 * Split one message's `content` into joined text and a list of well-formed
 * image parts, and say whether anything in it failed to parse as a part this
 * suite understands.
 *
 * `unrecognized: true` covers two cases on purpose: a content-parts array
 * holding something that is neither a text nor an image part in the shape
 * above (a typo, a future part type no adapter has learned yet, a caller
 * that invented its own `image_url` shape instead of using this one), and
 * content that is some other non-string, non-array value (a bare object) —
 * a caller almost certainly meant a string there. Both of those used to
 * reach `cloudflare.js` as `JSON.stringify(m.content ?? '')`: a JSON blob
 * read to the model as if it were the user's own words, at HTTP 200, costing
 * quota and returning confident nonsense. Every adapter that cannot
 * transmit an image now refuses loudly instead (see `AdapterError`'s
 * `unsupported_content` code) rather than doing that.
 *
 * A plain string (or `null`/`undefined`) is the ordinary, unchanged path:
 * `text` is the string itself (or `''`), `images` is empty, nothing is
 * unrecognized.
 *
 * @param {string|Array<object>|null|undefined} content
 * @returns {{text: string, images: Array<{mediaType: string, data: string}>, unrecognized: boolean}}
 */
export function partsOf(content) {
  if (typeof content === 'string' || content == null) {
    return { text: content ?? '', images: [], unrecognized: false };
  }
  if (!Array.isArray(content)) {
    return { text: '', images: [], unrecognized: true };
  }

  const texts = [];
  const images = [];
  let unrecognized = false;

  for (const part of content) {
    if (part && part.type === TEXT_PART && typeof part.text === 'string') {
      texts.push(part.text);
    } else if (
      part && part.type === IMAGE_PART &&
      typeof part.mediaType === 'string' && part.mediaType &&
      typeof part.data === 'string' && part.data
    ) {
      images.push({ mediaType: part.mediaType, data: part.data });
    } else {
      unrecognized = true;
    }
  }

  return { text: texts.join('\n'), images, unrecognized };
}

/** The text of one message's `content`, discarding any image parts. Used
 *  wherever a caller needs a plain string and does not care about images —
 *  e.g. `aiFeatureRunner`'s cache-subject/token-estimate `prompt`, which was
 *  never meant to carry raw base64 in the first place. */
export function textOnly(content) {
  return partsOf(content).text;
}

/**
 * True if resolving every message in the conversation would touch at least
 * one image or one part this suite does not recognize. Adapters that cannot
 * transmit an image use this as their one gate before doing any further
 * translation work.
 */
export function messagesNeedImageHandling(messages) {
  if (!Array.isArray(messages)) return false;
  return messages.some(m => {
    const { images, unrecognized } = partsOf(m?.content);
    return images.length > 0 || unrecognized;
  });
}

/**
 * The front door's image budget check — every message's content parts, one
 * pass, before `runFeatureCore` is ever called.
 *
 * @param {Array<{role:string, content:*}>|null} messages
 * @returns {{ok:true, count:number} | {ok:false, code:string, message:string}}
 */
export function validateImageBudget(messages) {
  if (!Array.isArray(messages)) return { ok: true, count: 0 };

  let count = 0;
  let totalBytes = 0;

  for (const message of messages) {
    const { images } = partsOf(message?.content);
    for (const image of images) {
      count += 1;
      if (count > MAX_IMAGES_PER_REQUEST) {
        return {
          ok: false,
          code: 'TOO_MANY_IMAGES',
          message: `at most ${MAX_IMAGES_PER_REQUEST} images are allowed per request`
        };
      }
      if (!ALLOWED_IMAGE_MEDIA_TYPES.has(image.mediaType)) {
        return {
          ok: false,
          code: 'INVALID_IMAGE_MEDIA_TYPE',
          message: `image mediaType must be one of: ${[...ALLOWED_IMAGE_MEDIA_TYPES].join(', ')}`
        };
      }
      // `.length` on the base64 string is a fine proxy for byte size — base64
      // runs ~4/3 the size of the decoded bytes, so this over-counts slightly
      // rather than under-counts, which is the safe direction for a cap.
      if (image.data.length > MAX_IMAGE_BASE64_BYTES) {
        return {
          ok: false,
          code: 'IMAGE_TOO_LARGE',
          message: `image data exceeds the ${Math.floor(MAX_IMAGE_BASE64_BYTES / (1024 * 1024))}MB per-image limit`
        };
      }
      totalBytes += image.data.length;
      if (totalBytes > MAX_TOTAL_IMAGE_BASE64_BYTES) {
        return {
          ok: false,
          code: 'IMAGE_BATCH_TOO_LARGE',
          message: `attached images exceed the ${Math.floor(MAX_TOTAL_IMAGE_BASE64_BYTES / (1024 * 1024))}MB combined limit`
        };
      }
    }
  }

  return { ok: true, count };
}

export default {
  TEXT_PART,
  IMAGE_PART,
  ALLOWED_IMAGE_MEDIA_TYPES,
  MAX_IMAGE_BASE64_BYTES,
  MAX_IMAGES_PER_REQUEST,
  MAX_TOTAL_IMAGE_BASE64_BYTES,
  partsOf,
  textOnly,
  messagesNeedImageHandling,
  validateImageBudget
};
