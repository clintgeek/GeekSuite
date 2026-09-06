import { z } from 'zod';
import { idString, historicalDateField, instantField, validateInput } from '../shared/validation.js';

export { validateInput };

/**
 * Input validation for the bookgeek gateway mutations — `DOCS/TODO_ORDER.md`
 * #22, the last of the four gateway modules (bujogeek `3265b1c`, then
 * notegeek and flockgeek `e23559c`). One strict schema per mutation family;
 * every rejection is one shape (`GraphQLError`, `extensions.code =
 * 'BAD_USER_INPUT'`, `extensions.details [{path,message}]`) built by the
 * shared `validateInput`.
 *
 * ## Books and shelves stay SHARED — only the Profile family is per-user
 *
 * `resolvers.js`'s own doc comment says it best: `Book` carries no
 * owner/userId field on purpose — every authenticated household member reads
 * and writes the same library. So there is no owner key to strip from
 * `createBook`/`updateBook`/`deleteBook`'s arguments (there never was one to
 * strip in the first place — no bookgeek mutation declares a `userId`/
 * `ownerId` argument at all), and these schemas do not change that sharing.
 * `saveBookProfile`, `saveLibraryFilter`, `deleteLibraryFilter`,
 * `addBookShelf` and `removeBookShelf` are the per-user family — scoped by
 * the session's `userId` in every resolver, never by a payload field.
 *
 * ## Every mutation here nests its payload under `input` — except four
 *
 * Unlike bujogeek/notegeek/flockgeek's flat argument lists, bookgeek's
 * create/update/profile/filter mutations take a single `input` object (the
 * GraphQL `CreateBookInput`/`UpdateBookInput`/`BookProfileInput`/
 * `SaveLibraryFilterInput` types), so both the outer args object AND the
 * nested input object are `.strict()` — an unknown top-level key and an
 * unknown key inside `input` are both a rejection. `deleteBook`,
 * `deleteLibraryFilter`, `addBookShelf` and `removeBookShelf` take flat
 * scalar arguments and need only the one level.
 *
 * ## ids stay strings — with one deliberate carve-out
 *
 * See `../shared/validation.js`. `updateBook`/`deleteBook` validate their
 * `id` only as a bounded string and leave the resolver's own
 * `validObjectId()` to decide "not found" vs. a real lookup —
 * `bookgeekOwnership.test.js`'s "malformed ids" suite asserts that a garbage
 * id degrades to `null`/`{success:false}`, never a thrown error, and this
 * schema does not disturb that. `deleteLibraryFilter`'s `id` is not a Mongo
 * ObjectId at all (it's a generated `filterId`, embedded on the Profile
 * document) but gets the same non-empty-bounded-string treatment for the
 * same reason: nothing here should assign meaning to what a valid id *looks
 * like*.
 *
 * The one exception is `removeBookShelf`'s `id`: `bookgeekProfile.test.js`
 * ("a built-in shelf can never be removed") deliberately calls it with `''`
 * among a list of built-in shelf ids and expects the resolver's own "Only
 * custom shelves can be removed" message, not a validation rejection. So that
 * field only bounds length; it does not require non-empty the way `idString`
 * does.
 *
 * ## Fields the resolver already validates keep their own error messages
 *
 * `deviceWord`, `kindleEmail`, `saveLibraryFilter`'s `name`, `addBookShelf`'s
 * `label` and `removeBookShelf`'s `id` all have resolver-level checks with
 * specific, tested error strings ("Secret word must be 3-24 characters…",
 * "Filter name is required", "Shelf name must be 40 characters or fewer",
 * "Only custom shelves can be removed", …). This layer validates *shape*
 * only for those fields — a bounded string, nothing trimmed or required —
 * so a blank or over-40-but-under-100-char value still reaches the
 * resolver's own check and its own message, exactly as before. The zod bound
 * here is a ceiling against abuse (a multi-megabyte "shelf name"), not a
 * replacement for the resolver's semantic validation.
 *
 * ## Dates: `publishedDate` is a HISTORICAL calendar day,
 * `dateStarted`/`dateFinished` are instants
 *
 * A book's publication date has no time-of-day — every source (ISBN
 * metadata, Open Library, a manual entry) gives a day, never a moment — so it
 * normalizes to UTC midnight. It is also the one date in the gateway that
 * records a *fact about the world* rather than something the suite schedules,
 * so it takes `historicalDateField()` and its 1000-01-01 floor, not the
 * shared 2000-01-01 scheduling floor: the edit dialog seeds `publishedDate`
 * from the book and resends it on every save, so a 2000 floor made *Dune*
 * (1965) permanently uneditable — a rating change came back as
 * `BAD_USER_INPUT` (BURN_REVIEW #1). Every other gateway date — flockgeek's
 * hatch/set/pairing/harvest days, bujogeek's due dates and habit logs — is a
 * scheduling value about a live flock or a live list and keeps the 2000
 * floor. `dateStarted`/`dateFinished` are real reading-progress timestamps
 * (when a session actually opened/closed the book), so they stay instants via
 * `instantField()` and keep whatever time-of-day they carry — and they are
 * genuinely recent, so the 2000 floor is right for them.
 *
 * ## Nullable vs. required is decided per field, against the GraphQL type
 *
 * `.nullable()` on an update field means "the client may explicitly send
 * `null` to clear this". That is correct for every field the `Book` type
 * declares nullable, and *wrong* for one it declares `String!`: the resolver
 * writes `{ $set: input }` with no `runValidators`, so a `null` lands in the
 * document and that row then errors out of every subsequent `books` query
 * against `Book.title: String!` (BURN_REVIEW #7). So `title` on update is
 * **optional but never nullable** — omit it to leave the title alone; there
 * is no way to clear it, by design. The other `String!`-backed inputs in
 * this module (`CreateBookInput.title`, `saveLibraryFilter`'s `name`,
 * `addBookShelf`'s `label`) are non-null GraphQL arguments that GraphQL
 * itself refuses a `null` for, and none of their zod schemas is
 * `.nullable()`; `BookCustomShelf.id`/`BookSavedFilter.id` are
 * server-generated. Every remaining `.nullable()` field here backs a
 * nullable GraphQL field, where clearing is the intended behaviour.
 */

// ── Shared field shapes ──────────────────────────────────────────────────────

const titleSchema = z.string().trim().min(1).max(500);
/** Optional on update — but NOT nullable: `Book.title` is `String!` and the
 *  resolver `$set`s the raw input. See the module doc, BURN_REVIEW #7. */
const optionalTitleSchema = z.string().trim().min(1).max(500).optional();
const authorItemSchema = z.string().trim().min(1).max(500);
const authorsSchema = z.array(authorItemSchema).max(50).nullable().optional();
const tagItemSchema = z.string().trim().min(1).max(100);
const tagsSchema = z.array(tagItemSchema).max(50).nullable().optional();
/** Built-in shelf names and `custom-<slug>` ids alike — see `resolvers.js`. */
const shelfSchema = z.string().trim().max(100).nullable().optional();
const isbnSchema = z.string().trim().max(64).nullable().optional();
/** An external catalog id (Goodreads, …) — not a lookup into our own data. */
const externalIdSchema = z.string().trim().max(128).nullable().optional();
const reviewSchema = z.string().trim().max(20_000).nullable().optional();
const languageSchema = z.string().trim().max(100).nullable().optional();
const publisherSchema = z.string().trim().max(500).nullable().optional();
/** A back-cover blurb. `Book.description` is nullable, so clearing it is legal. */
const descriptionSchema = z.string().trim().max(20_000).nullable().optional();
// `models/book.js`: `rating: { min: 0, max: 5 }`, `readingProgress: { min: 0, max: 100 }`.
const ratingSchema = z.number().min(0).max(5).nullable().optional();
const readingProgressSchema = z.number().int().min(0).max(100).nullable().optional();
const ownedSchema = z.boolean().nullable().optional();

// ── Books ────────────────────────────────────────────────────────────────────

export const createBookArgsSchema = z
  .object({
    input: z
      .object({
        title: titleSchema,
        authors: authorsSchema,
        isbn: isbnSchema,
        shelf: shelfSchema,
        owned: ownedSchema,
      })
      .strict(),
  })
  .strict();

export const updateBookArgsSchema = z
  .object({
    id: idString,
    input: z
      .object({
        title: optionalTitleSchema,
        authors: authorsSchema,
        description: descriptionSchema,
        shelf: shelfSchema,
        owned: ownedSchema,
        rating: ratingSchema,
        review: reviewSchema,
        tags: tagsSchema,
        language: languageSchema,
        publisher: publisherSchema,
        publishedDate: historicalDateField({ required: false }),
        isbn: isbnSchema,
        isbn13: isbnSchema,
        goodreadsId: externalIdSchema,
        readingProgress: readingProgressSchema,
        dateStarted: instantField({ required: false }),
        dateFinished: instantField({ required: false }),
      })
      .strict(),
  })
  .strict();

export const deleteBookArgsSchema = z
  .object({
    id: idString,
    deleteFiles: z.boolean().nullable().optional(),
  })
  .strict();

// ── Profile: Kindle address + device word ────────────────────────────────────

export const saveBookProfileArgsSchema = z
  .object({
    input: z
      .object({
        // Shape only — `normalizeDeviceWord`/`isValidDeviceWord` in
        // `resolvers.js` own the 3-24-char pattern and its message; an empty
        // or whitespace-only string is a real value here (it clears the word).
        kindleEmail: z.string().max(320).nullable().optional(),
        deviceWord: z.string().max(64).nullable().optional(),
      })
      .strict(),
  })
  .strict();

// ── Profile: saved library filters ──────────────────────────────────────────

export const saveLibraryFilterArgsSchema = z
  .object({
    input: z
      .object({
        // No minimum: a blank name reaches the resolver's own
        // "Filter name is required" check and message.
        name: z.string().max(200),
        sortBy: z.string().max(100).nullable().optional(),
        sortDir: z.string().max(20).nullable().optional(),
        searchQuery: z.string().max(500).nullable().optional(),
        authorFilter: z.string().max(500).nullable().optional(),
        tagFilter: z.string().max(200).nullable().optional(),
        shelfFilter: z.string().max(100).nullable().optional(),
        ownedOnly: z.boolean().nullable().optional(),
        // Not an enum: the resolver normalizes any unrecognized value to
        // "all" rather than rejecting it (`bookgeekProfile.test.js`'s
        // "ownedFilter drives ownedOnly" case sends `'nonsense'` on purpose).
        ownedFilter: z.string().max(20).nullable().optional(),
      })
      .strict(),
  })
  .strict();

export const deleteLibraryFilterArgsSchema = z.object({ id: idString }).strict();

// ── Profile: custom shelves ─────────────────────────────────────────────────

export const addBookShelfArgsSchema = z
  .object({
    // No minimum: a blank/punctuation-only/over-40-char label all reach the
    // resolver's own checks and messages; this is only an abuse ceiling.
    label: z.string().max(100),
  })
  .strict();

export const removeBookShelfArgsSchema = z
  .object({
    // `''` is a real, tested value — see the module doc above.
    id: z.string().max(256),
  })
  .strict();

// ── The library assistant (AI idea #4) ──────────────────────────────────────
//
// Both are reads that call a model, so the ceilings here are cost bounds, not
// data rules. `limit` is clamped rather than rejected in the resolver's own
// `Math.min` too — a client asking for 500 picks gets 20, not an error — but a
// non-integer or negative value is a caller bug and says so.

export const whatNextArgsSchema = z
  .object({
    limit: z.number().int().min(1).max(20).nullable().optional(),
  })
  .strict();

export const draftBookMetadataArgsSchema = z.object({ bookId: idString }).strict();
