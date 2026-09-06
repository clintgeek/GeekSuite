import { z } from 'zod';
import { GraphQLError } from 'graphql';
import { idString, validateInput } from '../shared/validation.js';

export { validateInput };

/**
 * Input validation for the notegeek gateway mutations — `DOCS/TODO_ORDER.md`
 * #22, the same layer bujogeek got in `3265b1c`. One strict schema per
 * mutation family; every rejection is one shape (`GraphQLError`,
 * `extensions.code = 'BAD_USER_INPUT'`, `extensions.details [{path,message}]`)
 * built by the shared `validateInput`.
 *
 * ## No dates here — on purpose
 *
 * NoteGeek's only timestamps are `createdAt`/`updatedAt`, and both are
 * mongoose-managed (`{ timestamps: true }` on `models/Note.js` and
 * `models/Folder.js`). No mutation takes a date argument, so there is nothing
 * to normalize and nothing a client can backdate. Were one ever added it would
 * be an INSTANT — "when this note was written" is a moment, not a calendar
 * day — and would use `instantField()` from `../shared/validation.js`, not
 * `calendarDateField()`.
 *
 * ## ids stay strings
 *
 * See `../shared/validation.js`. The resolvers do their own
 * `mongoose.isValidObjectId` check and `notegeekOwnership.test.js` asserts the
 * exact "Note not found" / "Folder not found" messages that follow from it, so
 * an id is bounded here as a string and left to the resolver to interpret.
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
const tagSchema = z.string().trim().min(1).max(100);
const tagsSchema = z.array(z.string().trim().max(100)).max(50).nullable().optional();

/**
 * Tags on UPDATE. `Note.tags` is `[String!]!`, so an explicit `null` may not
 * be written: the update resolver does `{ $set: args }` with no
 * `runValidators`, so the null lands in the document and every later
 * `notes` / `note` / `searchNotes` that touches that row then fails the
 * non-null check. Omit the field to leave tags alone; send `[]` to clear them.
 * Same rule as bookgeek's `title` (BURN_REVIEW #7). `createNote`'s `tags`
 * argument IS nullable in the schema, so create keeps `tagsSchema`.
 */
const updateTagsSchema = z.array(z.string().trim().max(100)).max(50).optional();
const folderNameSchema = z.string().trim().min(1).max(200);
const iconSchema = z.string().trim().max(64).nullable().optional();
const colorSchema = z.string().trim().max(32).nullable().optional();

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
  })
  .strict()
  .superRefine(checkContentCeiling({ unknownTypeIsSnapshot: true }));

export const deleteNoteArgsSchema = z.object({ id: idString }).strict();

export const renameTagArgsSchema = z
  .object({
    oldTag: tagSchema,
    newTag: tagSchema,
  })
  .strict();

export const deleteTagArgsSchema = z.object({ tag: tagSchema }).strict();

export const createFolderArgsSchema = z
  .object({
    name: folderNameSchema,
    parentId: idString.nullable().optional(),
    icon: iconSchema,
    color: colorSchema,
  })
  .strict();

export const updateFolderArgsSchema = z
  .object({
    id: idString,
    name: folderNameSchema.optional(),
    parentId: idString.nullable().optional(),
    icon: iconSchema,
    color: colorSchema,
  })
  .strict();

export const deleteFolderArgsSchema = z
  .object({
    id: idString,
    deleteNotes: z.boolean().nullable().optional(),
  })
  .strict();

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
