/**
 * transcribe.js — "what does this handwriting say?"
 *
 * The first half of NoteGeek's handwriting-to-Markdown path
 * (apps/notegeek/DOCS/HANDWRITING.md §2). The sketch editor exports its page
 * as a PNG; this reads it back as plain text; the writer corrects that text;
 * and only then, if they ask, does Compose turn it into a document.
 *
 * ## Why transcribe and compose are two calls, not one
 *
 * A model asked to "read this page and make nice Markdown of it" does both
 * jobs at once and you cannot tell which words it read and which it made up.
 * A faithful transcript is checkable against the page — the review step shows
 * both side by side — and fixable before anything is built on it. So this
 * prompt forbids exactly what Compose exists to do: no summarising, no
 * reordering, no tidying, no inventing. Illegible words are marked `[?]`
 * rather than guessed, because a confident guess is the one error the writer
 * will not notice.
 *
 * ## Failures are errors, never an empty transcript
 *
 * `runAIFeature` fails soft: a cap, an outage or an empty answer becomes the
 * fallback. For a transcript there is no honest fallback — an empty box looks
 * like "the model read nothing", which is a different claim from "the model
 * was never asked". So every refusal is thrown as a GraphQLError carrying the
 * same `extensions.details [{message}]` shape the validation layer uses, and
 * the client's `saveErrorMessage` reads it without a special case.
 */

import { GraphQLError } from 'graphql';
import { runAIFeature } from '../../services/aiFeatureRunner.js';
import { looksDegenerate } from './compose.js';

// Argument validation (media type, size, base64, magic bytes) is
// `transcribeSketchArgsSchema` in validation.js, run by the resolver before
// this module is reached — so before any model is asked or the cap counts.

/**
 * What a transcription needs, as a capability rather than a model id.
 *
 * `vision` because the input is an image — it filters the catalog to rows
 * whose listing accepts image input (in practice OpenRouter's). `prose`
 * because the answer is text a person reads and edits, not JSON: naming
 * `structured` here would filter to rows that do JSON mode, which says
 * nothing about reading handwriting. `balanced` because the writer is
 * watching a spinner, but a wrong word costs them more than a second does.
 * NoteGeek's paid-first routing row still goes first (aiFeatureRunner).
 */
export const TRANSCRIBE_NEED = 'vision+prose:balanced';

/** Per user, per UTC day. A page is one call; forty pages is a busy day. */
export const TRANSCRIBE_DAILY_CAP = 40;

/** One vision call on a 2000px page. Compose allows 25s for text alone. */
export const TRANSCRIBE_TIMEOUT_MS = 45000;

/** A dense handwritten page is ~400 words; this leaves room for two. */
export const TRANSCRIBE_MAX_TOKENS = 2500;

/**
 * The rules every transcription follows, sketch or photo. Shared text, so the
 * photo prompt cannot drift from the sketch prompt: it is these rules plus
 * the photo ones, never a rewrite of them.
 */
const TRANSCRIBE_RULES = `1. TRANSCRIBE FAITHFULLY. Write the words exactly as written, in the order they appear, with the writer's own spelling, abbreviations, numbers and punctuation.
2. NEVER INVENT, SUMMARISE OR TIDY. Do not add words, fix grammar, correct spelling, reorder, merge, expand abbreviations, add headings, or improve anything. That is someone else's job, later.
3. KEEP THE LAYOUT. Keep line breaks where the writer broke lines, keep blank lines between separate blocks, and keep list structure and indentation.
4. RENDER MARKS AS TEXT. Bullets as "- ", numbered items as written ("1."), arrows as "->" (or "<-", "<->"), an empty checkbox as "[ ]" and a ticked one as "[x]", underlining or boxes around words as the words alone.
5. MARK WHAT YOU CANNOT READ. Write "[?]" for each word you cannot read with confidence. Never guess a word and present it as read.
6. DRAWINGS GET ONE SHORT PHRASE. A drawing, diagram or doodle becomes "[drawing: ...]" with a few words saying what it is, and nothing more. Transcribe any words written inside or beside it.
7. PLAIN TEXT ONLY. No Markdown formatting, no code fences, no commentary, no "Here is the transcription". If the page has no writing at all, reply with exactly "[no writing]".`;

export const TRANSCRIBE_PROMPT = `You are transcribing a page of handwriting — a sketch-pad note written with a stylus. Your only job is to write down, as plain text, exactly what is written on the page.

Rules:
${TRANSCRIBE_RULES}`;

/**
 * A photographed paper notebook page (HANDWRITING.md §3). Everything the
 * sketch prompt says, plus what a camera adds: the paper itself (ruled lines,
 * margins, holes, edges), the desk and shadows around it, and the notebook's
 * own printing, which is not the writer's and must not enter the transcript.
 * Rule 7's "[no writing]" still applies — a blank ruled page is no writing.
 */
export const TRANSCRIBE_PHOTO_PROMPT = `You are transcribing a page of handwriting — a photograph of a page from a paper notebook, written in pen or pencil. Your only job is to write down, as plain text, exactly what the writer wrote on the page.

Rules:
${TRANSCRIBE_RULES}
8. HANDWRITTEN INK ONLY. Transcribe only what the writer wrote by hand. The paper, the photograph and the notebook's own printing are not writing.
9. IGNORE THE PAPER AND THE PHOTO. Ignore ruled lines, grid or dot lines, margin lines, page edges, punched holes, spiral binding, creases, shadows, glare, fingers, the desk and anything else in the background. None of them are text, and a ruled line is never an underline, a dash or a list marker.
10. IGNORE PRINTED TEXT. Ignore anything printed on the notebook itself — page headers, printed dates or "Date: ____" fields, page numbers, brand names and logos. Transcribe what the writer wrote into such a field, not the printed label.
11. COPE WITH SKEW. The page may be photographed at a slight angle or be slightly rotated or curved. Read along the writer's lines as they run on the page, not along the edges of the photo.`;

/** The system prompt for a page, by where it came from. */
export const transcribePromptFor = (source) => (source === 'photo' ? TRANSCRIBE_PHOTO_PROMPT : TRANSCRIBE_PROMPT);

/** A GraphQLError in the shape the client's `saveErrorMessage` already reads. */
function transcribeError(message, code, extra = {}) {
  return new GraphQLError(message, {
    extensions: { code, details: [{ path: [], message }], ...extra },
  });
}

const stripOuterFence = (text) => {
  const trimmed = (text || '').trim();
  const fence = trimmed.match(/^```[a-z]*\r?\n([\s\S]*?)\r?\n?```$/i);
  return fence ? fence[1] : trimmed;
};

/**
 * Read a page of handwriting.
 *
 * @param {object} opts
 * @param {string} opts.image      base64, no data: prefix (validated)
 * @param {string} opts.mediaType  image/png or image/jpeg (validated)
 * @param {'sketch'|'photo'} [opts.source]  which prompt reads it; 'sketch' by default
 * @param {string} opts.userId
 * @param {object} [opts.ai]       injectable aiService, for tests
 * @returns {Promise<{ text: string, provenance: object }>}
 */
export async function transcribeSketch({ image, mediaType, source = 'sketch', userId, ai = undefined }) {
  const result = await runAIFeature({
    app: 'notegeek',
    feature: 'transcribe',
    userId,
    messages: [
      { role: 'system', content: transcribePromptFor(source) },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: source === 'photo'
              ? 'Transcribe the handwriting on this photographed notebook page.'
              : 'Transcribe the handwriting on this page.',
          },
          { type: 'image', mediaType, data: image },
        ],
      },
    ],
    need: TRANSCRIBE_NEED,
    maxCallsPerDay: TRANSCRIBE_DAILY_CAP,
    timeoutMs: TRANSCRIBE_TIMEOUT_MS,
    maxTokens: TRANSCRIBE_MAX_TOKENS,
    // Reading, not writing: nothing here wants variety.
    temperature: 0,
    // Never shown. A fallback path always throws below.
    fallback: () => '',
    ...(ai ? { ai } : {}),
  });

  const prov = result.provenance || {};

  if (prov.source !== 'model') {
    if (prov.reason === 'cap') {
      throw transcribeError(
        `That is today's ${TRANSCRIBE_DAILY_CAP} handwriting conversions used. It resets at midnight UTC.`,
        'AI_CAP',
        { cap: TRANSCRIBE_DAILY_CAP }
      );
    }
    if (prov.reason === 'empty') {
      throw transcribeError('The model read nothing back from that page. Try again.', 'AI_EMPTY');
    }
    throw transcribeError(
      'Handwriting conversion is unavailable right now. Your sketch is unchanged; try again in a minute.',
      'AI_UNAVAILABLE',
      { reason: prov.reason || null }
    );
  }

  const text = stripOuterFence(typeof result.data === 'string' ? result.data : '');
  if (!text.trim()) {
    throw transcribeError('The model read nothing back from that page. Try again.', 'AI_EMPTY');
  }
  // The same guard Compose has: a model talking in circles is not a reading.
  if (looksDegenerate(text)) {
    throw transcribeError(
      'The model got stuck repeating itself, so that reading was thrown away. Try again.',
      'AI_DEGENERATE',
      { model: prov.model || null }
    );
  }

  return { text, provenance: prov };
}
