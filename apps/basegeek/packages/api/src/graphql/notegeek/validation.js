import { z } from 'zod';
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
 * server cannot know the stored type without a read it does not otherwise
 * need, so an update without a type gets the generous ceiling.
 *
 * `content` is deliberately NOT trimmed: it is a document body, and trailing
 * whitespace in a markdown file or a JSON snapshot is the caller's business.
 */

const NOTE_TYPES = ['text', 'markdown', 'code', 'mindmap', 'handwritten'];
/** Types whose `content` is a serialized editor snapshot, not prose. */
const SNAPSHOT_TYPES = new Set(['mindmap', 'handwritten']);

const DOC_CONTENT_MAX = 100_000;
const SNAPSHOT_CONTENT_MAX = 5_000_000;

const contentMaxFor = (type, { unknownTypeIsSnapshot = false } = {}) => {
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

const noteTypeSchema = z.enum(NOTE_TYPES).nullable().optional();
// `''` is a real value here: QuickCaptureHome saves a capture with no title.
const titleSchema = z.string().trim().max(500).nullable().optional();
const tagSchema = z.string().trim().min(1).max(100);
const tagsSchema = z.array(z.string().trim().max(100)).max(50).nullable().optional();
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
    content: z.string().max(SNAPSHOT_CONTENT_MAX).nullable().optional(),
    type: noteTypeSchema,
    tags: tagsSchema,
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
