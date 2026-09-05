import { Book } from "./models/book.js";
import { Profile } from "./models/profile.js";
import AIConfig from "../../models/AIConfig.js";
import mongoose from "mongoose";

// Built-in shelves. Users can also define custom shelves (ids prefixed
// "custom-", stored on their bookgeek Profile); those are counted below by
// aggregating whatever other shelf values exist on books.
const shelfNames = [
  "unread",
  "reading",
  "on-reader",
  "read",
  "want-to-read",
  "abandoned",
  "need-to-find",
];

// Ensure a book on the "unread" shelf is not actually finished/abandoned.
function shelfMatch(name) {
  if (name === "unread") {
    return {
      $and: [
        {
          $or: [
            { shelf: "unread" },
            { shelf: { $exists: false } },
            { shelf: null },
            { shelf: "" },
          ],
        },
        {
          $nor: [
            { shelf: "read" },
            { shelf: "abandoned" },
            { readCount: { $gt: 0 } },
            { dateFinished: { $exists: true, $ne: null } },
          ],
        },
      ],
    };
  }
  return { shelf: name };
}

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
    books: async (_, { page = 1, limit = 50, sort = "title", sortDir = "asc", author, tag, shelf, owned, q }, { user }) => {
      requireUser(user);
      const pageNum = Math.max(1, page);
      const limitNum = Math.max(1, Math.min(100, limit));

      const andConds = [];
      if (author) andConds.push({ authors: { $regex: author, $options: "i" } });
      if (tag) andConds.push({ tags: tag });
      if (shelf) andConds.push(shelfMatch(shelf));

      if (owned === "true") andConds.push({ owned: true });
      else if (owned === "false") andConds.push({ owned: false });

      if (q) {
        andConds.push({
          $or: [
            { title: { $regex: q, $options: "i" } },
            { authors: { $regex: q, $options: "i" } },
            { tags: { $regex: q, $options: "i" } },
          ],
        });
      }

      const filter = andConds.length > 0 ? { $and: andConds } : {};
      const sortObj = {};
      const dir = sortDir.toLowerCase() === "desc" ? -1 : 1;
      const sortKey = (sort || "title").toLowerCase();

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
  },
  Mutation: {
    createBook: async (_, { input }, { user }) => {
      requireUser(user);
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
    updateBook: async (_, { id, input }, { user }) => {
      requireUser(user);
      if (!validObjectId(id)) return null;
      const updated = await Book.findByIdAndUpdate(
        id,
        { $set: input },
        { new: true, lean: true }
      );
      return updated;
    },
    deleteBook: async (_, { id }, { user }) => {
      requireUser(user);
      if (!validObjectId(id)) return { success: false, deletedId: id };
      // Simplification: only deleting the book record here for now.
      // Full implementation should handle file deletion if requested.
      const res = await Book.deleteOne({ _id: id });
      return { success: res.deletedCount > 0, deletedId: id };
    },
    saveBookProfile: async (_, { input }, { user }) => {
      const userId = requireUser(user);

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
    saveLibraryFilter: async (_, { input }, { user }) => {
      const userId = requireUser(user);

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

      const profile = await Profile.findOneAndUpdate(
        { userId },
        { $setOnInsert: { userId }, $push: { savedFilters: preset } },
        { upsert: true, new: true, lean: true }
      );

      return savedFiltersOf(profile);
    },
    deleteLibraryFilter: async (_, { id }, { user }) => {
      const userId = requireUser(user);
      if (!id) throw userError("Filter id is required", "BAD_USER_INPUT");

      const profile = await Profile.findOneAndUpdate(
        { userId },
        { $pull: { savedFilters: { id } } },
        { new: true, lean: true }
      );

      return savedFiltersOf(profile);
    },
    addBookShelf: async (_, { label: rawLabel }, { user }) => {
      const userId = requireUser(user);

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
    removeBookShelf: async (_, { id: rawId }, { user }) => {
      const userId = requireUser(user);
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
