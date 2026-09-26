import { Book } from "./models/book.js";
import { Profile } from "./models/profile.js";
import AIConfig from "../../models/AIConfig.js";
import mongoose from "mongoose";
import * as library from "./library.js";
import { randomSortKey, pageFacetStage, shapePage } from "@geeksuite/collection/server";
import { SHELF_NAMES, shelfMatch, buildConditions, facetsPipeline, shapeFacets, legacyConditions } from "./filters.js";
import {
  validateInput,
  createBookArgsSchema,
  updateBookArgsSchema,
  deleteBookArgsSchema,
  saveBookProfileArgsSchema,
  saveLibraryFilterArgsSchema,
  deleteLibraryFilterArgsSchema,
  addBookShelfArgsSchema,
  removeBookShelfArgsSchema,
  whatNextArgsSchema,
  draftBookMetadataArgsSchema,
  booksFilterArgsSchema,
  bookFacetsArgsSchema,
} from "./validation.js";

// Input validation runs AFTER `requireUser` in every mutation below: an
// anonymous caller must still see `Unauthorized`, never a field-level
// complaint that describes a valid payload for them.
const validateCreateBook = validateInput(createBookArgsSchema);
const validateUpdateBook = validateInput(updateBookArgsSchema);
const validateDeleteBook = validateInput(deleteBookArgsSchema);
const validateSaveBookProfile = validateInput(saveBookProfileArgsSchema);
const validateSaveLibraryFilter = validateInput(saveLibraryFilterArgsSchema);
const validateDeleteLibraryFilter = validateInput(deleteLibraryFilterArgsSchema);
const validateAddBookShelf = validateInput(addBookShelfArgsSchema);
const validateRemoveBookShelf = validateInput(removeBookShelfArgsSchema);
const validateWhatNext = validateInput(whatNextArgsSchema);
const validateDraftBookMetadata = validateInput(draftBookMetadataArgsSchema);
const validateBooksFilter = validateInput(booksFilterArgsSchema);
const validateBookFacets = validateInput(bookFacetsArgsSchema);

// Built-in shelves. Users can also define custom shelves (ids prefixed
// "custom-", stored on their bookgeek Profile); those are counted below by
// aggregating whatever other shelf values exist on books. The list and
// `shelfMatch()` (the "unread" rule) live in filters.js, shared with
// `books(filter:)` and `bookFacets`.
const shelfNames = SHELF_NAMES;

function toNumber(value, type = "float") {
  if (value == null || value === "") return null;
  if (typeof value === "number") {
    if (Number.isNaN(value)) return null;
    return type === "int" ? Math.trunc(value) : value;
  }
  const n = Number(value);
  if (Number.isNaN(n)) return null;
  return type === "int" ? Math.trunc(n) : n;
}

/**
 * BookGeek is a deliberately SHARED household library: the Book model carries
 * no owner/userId field, and the standalone bookgeek API serves files and
 * covers without per-book ownership. So the security boundary here is
 * "authenticated household member", not "row owner" — every query and mutation
 * requires a signed-in user, but no read is narrowed to the caller. Per-user
 * data in this app lives on the Profile model, which IS scoped to the caller
 * by `userId` in every profile resolver below — the library is shared, a
 * person's Kindle address, secret word, custom shelves and saved filters are
 * not. Device baskets stay in the standalone bookgeek API (file work).
 */
function requireUser(user) {
  if (!user?.id) {
    const err = new Error("Unauthorized");
    err.code = "UNAUTHORIZED";
    throw err;
  }
  return user.id;
}

/** Guard Book.findById-style lookups so a malformed id is "not found", not a CastError. */
function validObjectId(id) {
  return typeof id === "string" || id instanceof mongoose.Types.ObjectId
    ? mongoose.isValidObjectId(id)
    : false;
}

function toBool(value) {
  if (value === true || value === 1 || value === "1" || value === "true") {
    return true;
  }
  if (value === false || value === 0 || value === "0" || value === "false") {
    return false;
  }
  return value ?? false;
}


// ---------------------------------------------------------------------------
// Profile helpers. These mirror `apps/bookgeek/api/src/server.js`'s former
// /api/profile/* routes and `deviceBasket.js`'s word rules exactly; the REST
// routes were deleted 2026-09-05 when the web app moved to these resolvers.
// ---------------------------------------------------------------------------

const DEVICE_WORD_PATTERN = /^[a-z][a-z0-9-]{2,23}$/;
const CUSTOM_SHELF_PREFIX = "custom-";
const MAX_CUSTOM_SHELVES = 20;
const MAX_CUSTOM_SHELF_LABEL = 40;

function normalizeDeviceWord(input) {
  return String(input ?? "").trim().toLowerCase();
}

function isValidDeviceWord(input) {
  return DEVICE_WORD_PATTERN.test(normalizeDeviceWord(input));
}

function generateFilterId() {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

function customShelfIdFromLabel(label) {
  const slug = String(label)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug ? `${CUSTOM_SHELF_PREFIX}${slug}` : null;
}

/** A user error the client is meant to read: same strings the REST routes sent. */
function userError(message, code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function savedFiltersOf(profile) {
  return Array.isArray(profile?.savedFilters) ? profile.savedFilters : [];
}

export const resolvers = {
  Book: {
    id: (parent) => parent._id?.toString(),
    pageCount: (parent) => toNumber(parent.pageCount, "int"),
    readCount: (parent) => toNumber(parent.readCount, "int"),
    rating: (parent) => toNumber(parent.rating, "float"),
    readingProgress: (parent) => toNumber(parent.readingProgress, "float"),
    owned: (parent) => toBool(parent.owned),
    // Date fields are passed through raw; the shared Date scalar serializes
    // them safely, coercing strings/numbers to ISO-8601.
    publishedDate: (parent) => parent.publishedDate,
    dateAdded: (parent) => parent.dateAdded,
    dateStarted: (parent) => parent.dateStarted,
    dateFinished: (parent) => parent.dateFinished,
    createdAt: (parent) => parent.createdAt,
    updatedAt: (parent) => parent.updatedAt,
  },
  BookSeries: {
    index: (parent) => toNumber(parent.index, "int"),
  },
  BookFile: {
    addedAt: (parent) => parent.addedAt,
    size: (parent) => toNumber(parent.size, "int"),
  },
  Query: {
    books: async (_, args, { user }) => {
      // `q`/`author` reach mongod as regex source, so they are escaped and
      // bounded (filters.js → @geeksuite/collection/server `searchRegex`).
      // Unescaped, ordinary titles broke the whole library page — `Dune
      // (Deluxe` is "Unterminated group", `C++` is "Nothing to repeat" — and a
      // crafted `(a+)+$` was a ReDoS evaluated per document.
      //
      // The flat args (`author`, `tag`, `shelf`, `owned`, `q`) are the pre-C2
      // library's and keep their exact semantics for old tabs; `filter` is the
      // faceted library's BookFilterInput (zod-checked below). Given both,
      // every one narrows.
      requireUser(user);
      const { page = 1, limit = 50, sort = "title", sortDir = "asc" } = args;
      const { filter: filterInput, seed } = validateBooksFilter({ filter: args.filter, seed: args.seed });
      const pageNum = Math.max(1, page ?? 1);
      const limitNum = Math.max(1, Math.min(100, limit ?? 50));

      const andConds = [
        ...legacyConditions(args),
        ...Object.values(buildConditions(filterInput ?? {})).map((c) => c.match),
      ];

      const filter = andConds.length > 0 ? { $and: andConds } : {};
      const sortKey = (sort || "title").toLowerCase();

      // A seeded shuffle: the same order on every page of one seed, a new one
      // per seed (@geeksuite/collection/server `randomSortKey`).
      if (sortKey === "random") {
        const [result] = await Book.aggregate([
          { $match: filter },
          { $addFields: { __shuffle: randomSortKey(seed ?? 0) } },
          pageFacetStage({ sort: { __shuffle: 1, _id: 1 }, page: pageNum, limit: limitNum, project: { __shuffle: 0 } }),
        ]);
        const { items, total } = shapePage(result, { page: pageNum, limit: limitNum });
        return { items, total, page: pageNum, pageSize: limitNum };
      }

      const sortObj = {};
      const dir = String(sortDir || "asc").toLowerCase() === "desc" ? -1 : 1;

      switch (sortKey) {
        case "author":
          sortObj["authors.0"] = dir;
          sortObj["title"] = dir;
          break;
        case "rating":
          sortObj["rating"] = dir;
          sortObj["title"] = 1;
          break;
        case "dateadded":
          sortObj["dateAdded"] = dir;
          sortObj["title"] = 1;
          break;
        // The four arms below are the ones the web's sort list (now
        // utils/libraryFilter.js SORT_ORDER) has
        // always offered and this resolver used to `default:` to title — so
        // "Page count ↑" returned an alphabetical list under a toolbar pill
        // that said "Page count ↑". Field names, direction and the
        // title tiebreaker are copied verbatim from bookgeek's own REST
        // `/api/books` (`apps/bookgeek/api/src/server.js`), which handled all
        // eight all along; the two drifted when the read moved to the gateway.
        // Null placement is mongo's default (nulls/missing sort first
        // ascending, last descending) in both, deliberately — matching REST
        // matters more than a nicer ordering that only one of them has.
        case "datefinished":
          sortObj["dateFinished"] = dir;
          sortObj["title"] = 1;
          break;
        case "pagecount":
          sortObj["pageCount"] = dir;
          sortObj["title"] = 1;
          break;
        case "publisheddate":
          sortObj["publishedDate"] = dir;
          sortObj["title"] = 1;
          break;
        case "owned":
          sortObj["owned"] = dir;
          sortObj["title"] = 1;
          break;
        case "title":
        default:
          sortObj["title"] = dir;
          break;
      }

      const skip = (pageNum - 1) * limitNum;
      const [items, total] = await Promise.all([
        Book.find(filter).sort(sortObj).skip(skip).limit(limitNum).lean(),
        Book.countDocuments(filter),
      ]);

      return {
        items,
        total,
        page: pageNum,
        pageSize: limitNum,
      };
    },
    // Each facet's counts apply every active filter EXCEPT its own
    // (filters.js). Household-shared like `books`: no user narrowing.
    bookFacets: async (_, rawArgs, { user }) => {
      requireUser(user);
      const { filter } = validateBookFacets(rawArgs ?? {});
      const [result] = await Book.aggregate(facetsPipeline(filter ?? {}));
      return shapeFacets(result, filter ?? {});
    },
    book: async (_, { id }, { user }) => {
      requireUser(user);
      if (!validObjectId(id)) return null;
      return await Book.findById(id).lean();
    },
    shelves: async (_, __, { user }) => {
      requireUser(user);
      const [total, owned, otherShelves, ...shelfCounts] = await Promise.all([
        Book.countDocuments({}),
        Book.countDocuments({ owned: true }),
        // Every shelf value that is not a built-in: custom shelves.
        Book.aggregate([
          { $match: { shelf: { $type: "string", $nin: ["", ...shelfNames] } } },
          { $group: { _id: "$shelf", count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ]),
        ...shelfNames.map((name) => Book.countDocuments(shelfMatch(name))),
      ]);

      const counts = {};
      shelfNames.forEach((n, i) => (counts[n] = shelfCounts[i]));

      return {
        total,
        owned,
        unowned: Math.max(0, total - owned),
        shelves: [
          ...Object.entries(counts).map(([id, count]) => ({ id, count })),
          ...otherShelves.map((s) => ({ id: s._id, count: s.count })),
        ],
      };
    },
    bookProfile: async (_, __, { user }) => {
      const userId = requireUser(user);
      return await Profile.findOne({ userId }).lean();
    },
    libraryFilters: async (_, __, { user }) => {
      const userId = requireUser(user);
      const profile = await Profile.findOne({ userId }, { savedFilters: 1 }).lean();
      return savedFiltersOf(profile);
    },
    bookAiStatus: async (_, __, { user }) => {
      requireUser(user);
      // bookgeek's old /api/ai/status reported on ITS OWN AIGEEK_API_KEY env
      // var — the key it used to call basegeek. Asked at the gateway, the same
      // question is "does basegeek have a usable AI provider", so that is what
      // this counts. No key is read, decrypted, or returned.
      const [configured, enabled] = await Promise.all([
        AIConfig.countDocuments({ apiKey: { $exists: true, $nin: [null, ""] } }),
        AIConfig.countDocuments({ enabled: true }),
      ]);
      return {
        enabled: enabled > 0,
        apiKeyConfigured: configured > 0,
        baseGeekUrl: process.env.BASEGEEK_URL || "https://basegeek.clintgeek.com",
        model: "basegeek-rotation",
        providers: enabled,
      };
    },
    // ── The library assistant (AI idea #4) ──────────────────────────────
    // Both are reads. `whatNext` computes the candidate set and lets the model
    // only rank it; `draftBookMetadata` proposes fields the client shows as a
    // draft and the user saves through `updateBook`. Neither writes. The
    // opt-in switch lives on the caller's `appPreferences.bookgeek`, and when
    // it is off both still answer — with the deterministic fallback.
    whatNext: async (_, rawArgs, { user }) => {
      const userId = requireUser(user);
      const { limit } = validateWhatNext(rawArgs);
      const picks = Math.min(library.MAX_PICKS, Math.max(1, limit ?? 5));
      const enabled = await library.libraryAssistantEnabled(userId);
      return await library.whatNext({ userId, limit: picks, enabled });
    },
    draftBookMetadata: async (_, rawArgs, { user }) => {
      const userId = requireUser(user);
      const { bookId } = validateDraftBookMetadata(rawArgs);
      // Same "a malformed id is simply not found" rule the rest of the module
      // follows — but the field is non-null, so it is an error, not a null.
      const book = validObjectId(bookId) ? await Book.findById(bookId).lean() : null;
      if (!book) throw userError("Book not found", "NOT_FOUND");
      const enabled = await library.libraryAssistantEnabled(userId);
      return await library.draftBookMetadata({ userId, book, enabled });
    },
  },
  Mutation: {
    createBook: async (_, rawArgs, { user }) => {
      requireUser(user);
      const { input } = validateCreateBook(rawArgs);
      const doc = {
        title: input.title,
        authors: input.authors || [],
        isbn: input.isbn,
        shelf: input.shelf || "want-to-read",
        owned: input.owned || false,
        dateAdded: new Date(),
        source: "manual",
      };

      const book = await Book.create(doc);
      return book.toObject ? book.toObject() : book;
    },
    updateBook: async (_, rawArgs, { user }) => {
      requireUser(user);
      const { id, input } = validateUpdateBook(rawArgs);
      if (!validObjectId(id)) return null;
      const updated = await Book.findByIdAndUpdate(
        id,
        { $set: input },
        { new: true, lean: true }
      );
      return updated;
    },
    deleteBook: async (_, rawArgs, { user }) => {
      requireUser(user);
      const { id } = validateDeleteBook(rawArgs);
      if (!validObjectId(id)) return { success: false, deletedId: id };
      // Simplification: only deleting the book record here for now.
      // Full implementation should handle file deletion if requested.
      const res = await Book.deleteOne({ _id: id });
      return { success: res.deletedCount > 0, deletedId: id };
    },
    saveBookProfile: async (_, rawArgs, { user }) => {
      const userId = requireUser(user);
      const { input } = validateSaveBookProfile(rawArgs);

      const set = {};
      const unset = {};
      if (typeof input?.kindleEmail === "string") {
        set.kindleEmail = input.kindleEmail.trim();
      }

      if (typeof input?.deviceWord === "string") {
        const word = normalizeDeviceWord(input.deviceWord);
        if (!word) {
          // Empty string clears the word.
          unset.deviceWord = "";
        } else if (!isValidDeviceWord(word)) {
          throw userError(
            "Secret word must be 3-24 characters, start with a letter, and contain only letters, numbers or hyphens",
            "BAD_USER_INPUT"
          );
        } else {
          const taken = await Profile.findOne(
            { deviceWord: word, userId: { $ne: userId } },
            { _id: 1 }
          ).lean();
          if (taken) throw userError("That word is already taken", "CONFLICT");
          set.deviceWord = word;
        }
      }

      const updateDoc = { $setOnInsert: { userId } };
      if (Object.keys(set).length) updateDoc.$set = set;
      if (Object.keys(unset).length) updateDoc.$unset = unset;

      try {
        return await Profile.findOneAndUpdate({ userId }, updateDoc, {
          upsert: true,
          new: true,
          lean: true,
        });
      } catch (err) {
        // Racing writers can slip past the pre-check; the unique sparse index
        // is the real arbiter.
        if (err && err.code === 11000) {
          throw userError("That word is already taken", "CONFLICT");
        }
        throw err;
      }
    },
    saveLibraryFilter: async (_, rawArgs, { user }) => {
      const userId = requireUser(user);
      const { input } = validateSaveLibraryFilter(rawArgs);

      const name = typeof input?.name === "string" ? input.name.trim() : "";
      if (!name) throw userError("Filter name is required", "BAD_USER_INPUT");

      const str = (v, fallback = "") => (typeof v === "string" ? v : fallback);
      const ownedFilterRaw = str(input?.ownedFilter) || "all";
      const ownedFilter =
        ownedFilterRaw === "owned" || ownedFilterRaw === "unowned" ? ownedFilterRaw : "all";

      const preset = {
        id: generateFilterId(),
        name,
        sortBy: str(input?.sortBy) || undefined,
        sortDir: str(input?.sortDir) || "asc",
        searchQuery: str(input?.searchQuery),
        authorFilter: str(input?.authorFilter),
        tagFilter: str(input?.tagFilter),
        shelfFilter: str(input?.shelfFilter) || "all",
        ownedFilter,
        // Backward compatibility: prefer explicit ownedFilter, but also
        // respect a legacy boolean ownedOnly from older clients.
        ownedOnly:
          ownedFilter === "owned" ? true : ownedFilter === "unowned" ? false : !!input?.ownedOnly,
      };
      // The whole BookFilterInput (C2), checked by the same schema as the
      // query's. Views saved without one open through the legacy fields.
      if (input?.filter && typeof input.filter === "object") preset.filter = input.filter;

      const profile = await Profile.findOneAndUpdate(
        { userId },
        { $setOnInsert: { userId }, $push: { savedFilters: preset } },
        { upsert: true, new: true, lean: true }
      );

      return savedFiltersOf(profile);
    },
    deleteLibraryFilter: async (_, rawArgs, { user }) => {
      const userId = requireUser(user);
      const { id } = validateDeleteLibraryFilter(rawArgs);

      const profile = await Profile.findOneAndUpdate(
        { userId },
        { $pull: { savedFilters: { id } } },
        { new: true, lean: true }
      );

      return savedFiltersOf(profile);
    },
    addBookShelf: async (_, rawArgs, { user }) => {
      const userId = requireUser(user);
      const { label: rawLabel } = validateAddBookShelf(rawArgs);

      const label =
        typeof rawLabel === "string" ? rawLabel.trim().replace(/\s+/g, " ") : "";
      if (!label) throw userError("Shelf name is required", "BAD_USER_INPUT");
      if (label.length > MAX_CUSTOM_SHELF_LABEL) {
        throw userError(
          `Shelf name must be ${MAX_CUSTOM_SHELF_LABEL} characters or fewer`,
          "BAD_USER_INPUT"
        );
      }
      const id = customShelfIdFromLabel(label);
      if (!id) {
        throw userError("Shelf name needs at least one letter or number", "BAD_USER_INPUT");
      }

      const existing = await Profile.findOne({ userId }, { customShelves: 1 }).lean();
      const current = Array.isArray(existing?.customShelves) ? existing.customShelves : [];
      if (current.some((s) => s.id === id)) {
        throw userError("You already have a shelf with that name", "CONFLICT");
      }
      if (current.length >= MAX_CUSTOM_SHELVES) {
        throw userError(
          `You can have up to ${MAX_CUSTOM_SHELVES} custom shelves`,
          "BAD_USER_INPUT"
        );
      }

      return await Profile.findOneAndUpdate(
        { userId },
        { $setOnInsert: { userId }, $push: { customShelves: { id, label } } },
        { upsert: true, new: true, lean: true }
      );
    },
    // Removing a shelf also clears it from any book sitting on it. Books are
    // shared across users, so those books land back on Unread for everyone.
    removeBookShelf: async (_, rawArgs, { user }) => {
      const userId = requireUser(user);
      const { id: rawId } = validateRemoveBookShelf(rawArgs);
      const id = String(rawId || "");
      if (!id.startsWith(CUSTOM_SHELF_PREFIX)) {
        throw userError("Only custom shelves can be removed", "BAD_USER_INPUT");
      }

      const profile = await Profile.findOneAndUpdate(
        { userId },
        { $pull: { customShelves: { id } } },
        { new: true, lean: true }
      );
      const cleared = await Book.updateMany({ shelf: id }, { $unset: { shelf: "" } });

      return { profile, clearedBooks: cleared?.modifiedCount ?? 0 };
    },
  },
  BookProfile: {
    customShelves: (parent) =>
      Array.isArray(parent?.customShelves) ? parent.customShelves : [],
    savedFilters: (parent) => savedFiltersOf(parent),
    createdAt: (parent) => parent.createdAt,
    updatedAt: (parent) => parent.updatedAt,
  },
};
