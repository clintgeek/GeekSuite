import { z } from 'zod';
import { GraphQLError } from 'graphql';
import { idString, validateInput } from '../shared/validation.js';
import { normalizeTag, normalizeTags } from './tags.js';

export { validateInput };

/**
 * Input validation for the notegeek gateway mutations — `DOCS/TODO_ORDER.md`
 * #22, the same layer todogeek got in `3265b1c`. One strict schema per
 * mutation family; every rejection is one shape (`GraphQLError`,
 * `extensions.code = 'BAD_USER_INPUT'`, `extensions.details [{path,message}]`)
 * built by the shared `validateInput`.
 *
 * ## No dates here — on purpose
 *
 * NoteGeek's only timestamps are `createdAt`/`updatedAt`, and both are
 * mongoose-managed (`{ timestamps: true }` on `models/Note.js`). No mutation
 * takes a date argument, so there is nothing to normalize and nothing a
 * client can backdate. Were one ever added it would be an INSTANT — "when
 * this note was written" is a moment, not a calendar day — and would use
 * `instantField()` from `../shared/validation.js`, not `calendarDateField()`.
 *
 * ## ids stay strings
 *
 * See `../shared/validation.js`. The resolvers do their own
 * `mongoose.isValidObjectId` check and `notegeekOwnership.test.js` asserts the
 * exact "Note not found" message that follows from it, so an id is bounded
 * here as a string and left to the resolver to interpret.
 *
 * ## Why `content` has two ceilings
 *
 * A `text`/`markdown`/`code` note is a document a human typed: 100 000
 * characters is already a 100-page manuscript. A `mindmap` or `handwritten`
 * note is not a document at all — `components/editors/HandwrittenEditor.jsx`
 * stores a serialized tldraw snapshot in the same `content` field, and a
 * sketch with a few dozen shapes clears 100 000 characters without trying. One
 * flat cap would either reject real sketches or be no cap at all for prose, so
 * the ceiling is chosen from the note's own `type`. `updateNote` may omit
 * `type` (nothing in the frontend does, but the argument is optional), and the
 * schema cannot know the stored type, so an update without a type gets the
 * generous ceiling HERE. The resolver DOES read the stored type — it has to,
 * in order to sanitize correctly — and re-applies the right ceiling with
 * `assertContentCeiling()` before anything reaches the sanitizer, and again on
 * the sanitizer's output. See that function for why both.
 *
 * `content` is deliberately NOT trimmed: it is a document body, and trailing
 * whitespace in a markdown file or a JSON snapshot is the caller's business.
 */

const NOTE_TYPES = ['text', 'markdown', 'code', 'mindmap', 'handwritten'];
/** Types whose `content` is a serialized editor snapshot, not prose. */
const SNAPSHOT_TYPES = new Set(['mindmap', 'handwritten']);

const DOC_CONTENT_MAX = 100_000;
const SNAPSHOT_CONTENT_MAX = 5_000_000;

export const contentMaxFor = (type, { unknownTypeIsSnapshot = false } = {}) => {
  if (type === undefined || type === null) {
    return unknownTypeIsSnapshot ? SNAPSHOT_CONTENT_MAX : DOC_CONTENT_MAX;
  }
  return SNAPSHOT_TYPES.has(type) ? SNAPSHOT_CONTENT_MAX : DOC_CONTENT_MAX;
};

/** Enforce the type-dependent `content` ceiling as a sibling-field rule. */
const checkContentCeiling = (opts) => (args, ctx) => {
  if (typeof args.content !== 'string') return;
  const max = contentMaxFor(args.type, opts);
  if (args.content.length > max) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['content'],
      message: `String must contain at most ${max} character(s)`,
    });
  }
};

/**
 * The same ceiling, enforced where the schema could not: in the resolver,
 * once the note's EFFECTIVE type is known.
 *
 * Two callers, one rule.
 *
 *  - **Before sanitizing.** `updateNoteArgsSchema` has to accept the snapshot
 *    ceiling for an update that omits `type`, because the schema cannot read
 *    the row. The resolver can, and a 5 MB body on a `text` row must be
 *    rejected *before* it reaches jsdom + DOMPurify — 5 MB measured at
 *    16 365 ms of fully synchronous, gateway-wide event-loop block
 *    (BURN_REVIEW_2 #4).
 *  - **After sanitizing.** The sanitizer can make a body LONGER: `hardenRel`
 *    adds `rel`/`target` to every anchor and DOMPurify escapes bare `&`. A
 *    100 000-character body of small anchors was stored at 187 486 characters,
 *    past the ceiling it had just passed, and every later save of that note
 *    was then rejected — permanently unsaveable (BURN_REVIEW_2 #6). What is
 *    stored is what must fit.
 *
 * An unknown type keeps the generous ceiling: it means the row was not found
 * (the update is about to fail with "Note not found" anyway) and tightening
 * here would answer the wrong error.
 *
 * Same rejection shape as `validateInput`, so a client sees one error contract.
 */
export function assertContentCeiling(content, type, { sanitized = false } = {}) {
  if (typeof content !== 'string') return content;
  const max = contentMaxFor(type, { unknownTypeIsSnapshot: true });
  if (content.length <= max) return content;
  throw new GraphQLError('Invalid input', {
    extensions: {
      code: 'BAD_USER_INPUT',
      http: { status: 400 },
      details: [
        {
          path: 'content',
          message: sanitized
            ? `String must contain at most ${max} character(s) after sanitization`
            : `String must contain at most ${max} character(s)`,
        },
      ],
    },
  });
}

/**
 * `type` is OPTIONAL but never NULL.
 *
 * `Note.type` is `String!` in `typeDefs.js` and `notes: [Note!]!`, so one row
 * with a null type nulls the whole list for that user — the same non-null
 * poisoning the `tags` note below describes. Worse, `sanitize.js` chooses
 * whether to sanitize from this field: `HTML_NOTE_TYPES.has(null)` is false,
 * so a stored null made a later typeless update store HTML **unsanitized**
 * (BURN_REVIEW_2 #5). Omit the field to leave the type alone; `createNote`
 * falls back to `text`, which is the mongoose default, when it is absent.
 */
const noteTypeSchema = z.enum(NOTE_TYPES).optional();
// `''` is a real value here: QuickCaptureHome saves a capture with no title.
const titleSchema = z.string().trim().max(500).nullable().optional();
/**
 * Tags are `/`-separated paths in the suite standard (`@geeksuite/tags`,
 * DOCS/TAG_STANDARD.md — lowercase kebab-case segments). Every tag that
 * reaches a write is normalized: `" House // Garage Door/ "` is stored as
 * `house/garage-door`. A name that normalizes to nothing (`"/"`, `"&&"`) is
 * not a tag, so rename/delete reject it the same way they reject `""`. The
 * 100-character cap is checked on the raw input AND on the normalized result,
 * since normalizing can lengthen a tag (`GeekSuite` → `geek-suite`).
 */
const tagSchema = z.string().trim().min(1).max(100).transform(normalizeTag).pipe(z.string().min(1).max(100));
const normalizedTagList = z.array(z.string().max(100));
/** Note tag lists: normalized, empties dropped, deduped in order. */
const tagsSchema = z.array(z.string().trim().max(100)).max(50).transform(normalizeTags).pipe(normalizedTagList).nullable().optional();

/**
 * Tags on UPDATE. `Note.tags` is `[String!]!`, so an explicit `null` may not
 * be written: the update resolver does `{ $set: args }` with no
 * `runValidators`, so the null lands in the document and every later
 * `notes` / `note` / `searchNotes` that touches that row then fails the
 * non-null check. Omit the field to leave tags alone; send `[]` to clear them.
 * Same rule as bookgeek's `title` (BURN_REVIEW #7). `createNote`'s `tags`
 * argument IS nullable in the schema, so create keeps `tagsSchema`.
 */
const updateTagsSchema = z.array(z.string().trim().max(100)).max(50).transform(normalizeTags).pipe(normalizedTagList).optional();

export const createNoteArgsSchema = z
  .object({
    title: titleSchema,
    // `Note.content` is `required` in mongoose, which rejects `''` — the
    // minimum here says the same thing earlier and in the shared error shape.
    content: z.string().min(1).max(SNAPSHOT_CONTENT_MAX),
    type: noteTypeSchema,
    tags: tagsSchema,
  })
  .strict()
  .superRefine(checkContentCeiling());

export const updateNoteArgsSchema = z
  .object({
    id: idString,
    title: titleSchema,
    // No minimum on update: the editor allows a titled note whose body has
    // been emptied, and blanking `content` is how that is saved today.
    // `Note.content` is `String!` — same rule as tags above.
    content: z.string().max(SNAPSHOT_CONTENT_MAX).optional(),
    type: noteTypeSchema,
    tags: updateTagsSchema,
    // Labels the history entry this update creates. NOT a note field — the
    // resolver peels it off before building the update payload, so it can
    // never be written to the row. Constrained to the labels the history UI
    // knows how to render, rather than left free-form, because an unbounded
    // string on a strict schema is an invitation.
    // `tidy` was a member until 2026-09-22, when the Tidy feature was
    // removed. It never actually reached a stored version — Tidy wrote through
    // the ordinary save path, which labels itself `edit` — so nothing in the
    // history depends on it.
    changeReason: z.enum(['edit', 'compose', 'restore']).optional(),
  })
  .strict()
  .superRefine(checkContentCeiling({ unknownTypeIsSnapshot: true }));

/**
 * Compose takes raw pasted material, so the ceiling is the snapshot one
 * rather than a type-specific limit — the caller may be handing over the
 * body of a `text` note, a `markdown` note, or a paste that belongs to
 * neither yet. `compose.js` enforces its own, smaller working limit and
 * REFUSES past it rather than truncating.
 */
export const composeNoteArgsSchema = z
  .object({
    content: z.string().min(1).max(SNAPSHOT_CONTENT_MAX),
  })
  .strict();

export const deleteNoteArgsSchema = z.object({ id: idString }).strict();

// ── Archive / Compose-many (DOCS/COMPOSE_MANY_AND_ARCHIVE_SPEC.md) ──────────

/** How many notes one archiveNotes / restoreNotes call may name (spec A5). */
export const ARCHIVE_IDS_MAX = 100;

/**
 * Archive or restore. 1–100 ids; an id that is malformed or not the caller's
 * is NOT an error here or in the resolver — it is simply not in the result.
 */
export const archiveNotesArgsSchema = z
  .object({
    ids: z.array(idString).min(1, 'Choose at least one note.').max(ARCHIVE_IDS_MAX),
  })
  .strict();

/** The Archived view's paging. Absent = defaults in the resolver. */
export const archivedNotesArgsSchema = z
  .object({
    limit: z.number().int().min(1).max(200).nullish(),
    offset: z.number().int().min(0).max(100_000).nullish(),
  })
  .strict();

/** How many notes one composeNotes may combine (spec C1). */
export const COMPOSE_NOTES_MIN = 2;
export const COMPOSE_NOTES_MAX = 20;

export const composeNotesArgsSchema = z
  .object({
    noteIds: z
      .array(idString)
      .min(COMPOSE_NOTES_MIN, `Choose at least ${COMPOSE_NOTES_MIN} notes to compose.`)
      .max(COMPOSE_NOTES_MAX, `Compose takes up to ${COMPOSE_NOTES_MAX} notes at a time.`),
  })
  .strict();

// ── Fold-in (foldin.js) ─────────────────────────────────────────────────────

/** Kept in step with `foldin.js#MAX_FOLD_INPUT_CHARS` (asserted by its tests). */
export const FOLD_IN_INPUT_MAX = 12000;
/** Kept in step with `foldin.js#MAX_OPERATIONS`. */
export const FOLD_IN_OPS_MAX = 30;

/**
 * The new information is REFUSED past the ceiling, never cut: a fold-in that
 * quietly used the first 12 000 characters would place some of what the
 * person pasted and lose the rest without a word.
 */
export const foldInPreviewArgsSchema = z
  .object({
    noteId: idString,
    input: z
      .string()
      .refine((s) => s.trim().length > 0, 'Paste or type the new information first.')
      .refine((s) => s.length <= FOLD_IN_INPUT_MAX, `Fold-in takes up to ${FOLD_IN_INPUT_MAX.toLocaleString('en-US')} characters at a time. For more, use Compose.`),
  })
  .strict();

/**
 * Operations come back as loose objects on purpose: each one is validated by
 * `foldin.js#operationSchema` against the note as it is now, and the apply is
 * all-or-nothing on that result. This layer only bounds the envelope.
 */
export const foldInApplyArgsSchema = z
  .object({
    noteId: idString,
    baseUpdatedAt: z.string().trim().min(1).max(64),
    operations: z.array(z.record(z.any())).min(1, 'Choose at least one change.').max(FOLD_IN_OPS_MAX),
  })
  .strict();

/** Pin or unpin a note. Both arguments required — there is no "leave alone". */
export const setNotePinnedArgsSchema = z
  .object({
    id: idString,
    pinned: z.boolean(),
  })
  .strict();

export const renameTagArgsSchema = z
  .object({
    oldTag: tagSchema,
    newTag: tagSchema,
  })
  .strict();

export const deleteTagArgsSchema = z.object({ tag: tagSchema }).strict();

/**
 * `suggestForNote` — the only READ in this module with a validated argument
 * list, and the only one whose ceiling is enforced by TRUNCATION.
 *
 * The excerpt is whatever the editor happens to be holding when the note is
 * saved. Rejecting an over-long one would turn a helpful strip into an error
 * toast on exactly the notes it is most useful for (long ones), so the schema
 * takes the first `EXCERPT_MAX` characters and says nothing. Same for the
 * title, whose 500-character ceiling `createNote` already enforces on the
 * write path — a suggestion request is not the place to relitigate it.
 *
 * `noteId` is nullable: the strip appears on an unsaved note too, and there is
 * nothing to exclude from the related-note candidates in that case.
 */
/** The excerpt ceiling, enforced by truncation. `suggest.js` reads it from here. */
export const EXCERPT_MAX = 500;
/** The title ceiling — the same 500 `createNote` enforces on the write path. */
export const TITLE_MAX = 500;

export const suggestForNoteArgsSchema = z
  .object({
    noteId: idString.nullable().optional(),
    title: z.string().transform((s) => s.slice(0, TITLE_MAX)),
    excerpt: z.string().transform((s) => s.slice(0, EXCERPT_MAX)),
    tags: z.array(z.string().trim().max(100)).max(50),
  })
  .strict();


// ── transcribeSketch (apps/notegeek/DOCS/HANDWRITING.md §2) ─────────────────

export const TRANSCRIBE_MEDIA_TYPES = ['image/png', 'image/jpeg'];

/**
 * Where the page came from (HANDWRITING.md §3). `sketch` is a stylus page
 * exported from tldraw; `photo` is a camera shot of a paper notebook, which
 * gets extra rules (ignore ruled lines and anything printed). Optional, and
 * `sketch` when absent, so last night's clients keep working unchanged.
 */
export const TRANSCRIBE_SOURCES = ['sketch', 'photo'];

/**
 * About 8 MB of base64, which is a 6 MB image. The NoteGeek client refuses
 * anything bigger before sending it (`utils/sketchExport.js`); this is the
 * backstop for any other caller, checked before a model is asked.
 */
export const TRANSCRIBE_MAX_BASE64_CHARS = 8 * 1024 * 1024;

// The first bytes of each allowed format, as base64. PNG's 8-byte signature
// encodes to `iVBORw0KGgo`; every JPEG starts FF D8 FF, which is `/9j/`.
const IMAGE_SIGNATURES = {
  'image/png': 'iVBORw0KGgo',
  'image/jpeg': '/9j/',
};

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * A page image for the vision model.
 *
 * The declared mediaType must match the bytes. `services/ai/adapters/
 * imageContent.js` trusts the caller's declaration, and a provider handed a
 * PNG labelled JPEG answers with a 400 that would reach the writer as
 * "unavailable" — so the lie is caught here, where it can be named.
 */
export const transcribeSketchArgsSchema = z
  .object({
    mediaType: z.enum(TRANSCRIBE_MEDIA_TYPES, {
      errorMap: () => ({ message: `mediaType must be ${TRANSCRIBE_MEDIA_TYPES.join(' or ')}.` }),
    }),
    image: z
      .string()
      .min(1, 'The image is empty.')
      .max(TRANSCRIBE_MAX_BASE64_CHARS, 'That page is too large to read (over about 6 MB as an image).')
      .refine((s) => !s.startsWith('data:'), 'Send the image as bare base64, without a data: prefix.')
      .refine((s) => s.startsWith('data:') || BASE64.test(s), 'The image is not valid base64.'),
    source: z
      .enum(TRANSCRIBE_SOURCES, {
        errorMap: () => ({ message: `source must be ${TRANSCRIBE_SOURCES.join(' or ')}.` }),
      })
      .nullish()
      .transform((v) => v ?? 'sketch'),
  })
  .strict()
  .superRefine((args, ctx) => {
    const signature = IMAGE_SIGNATURES[args.mediaType];
    if (signature && typeof args.image === 'string' && BASE64.test(args.image) && !args.image.startsWith(signature)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['image'],
        message: `The image is not a ${args.mediaType === 'image/png' ? 'PNG' : 'JPEG'}.`,
      });
    }
  });
