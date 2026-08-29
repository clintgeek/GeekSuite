import { Book } from "./models/book.js";
import mongoose from "mongoose";

const shelfNames = [
  "unread",
  "reading",
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

function toBool(value) {
  if (value === true || value === 1 || value === "1" || value === "true") {
    return true;
  }
  if (value === false || value === 0 || value === "0" || value === "false") {
    return false;
  }
  return value ?? false;
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
    books: async (_, { page = 1, limit = 50, sort = "title", sortDir = "asc", author, tag, shelf, owned, q }) => {
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
    book: async (_, { id }) => {
      return await Book.findById(id).lean();
    },
    shelves: async () => {
      const [total, owned, ...shelfCounts] = await Promise.all([
        Book.countDocuments({}),
        Book.countDocuments({ owned: true }),
        ...shelfNames.map((name) => Book.countDocuments(shelfMatch(name))),
      ]);

      const counts = {};
      shelfNames.forEach((n, i) => (counts[n] = shelfCounts[i]));

      return {
        total,
        owned,
        unowned: Math.max(0, total - owned),
        shelves: Object.entries(counts).map(([id, count]) => ({ id, count })),
      };
    },
  },
  Mutation: {
    createBook: async (_, { input }, { user }) => {
      if (!user) throw new Error("Unauthorized");
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
    updateBook: async (_, { id, input }) => {
      const updated = await Book.findByIdAndUpdate(
        id,
        { $set: input },
        { new: true, lean: true }
      );
      return updated;
    },
    deleteBook: async (_, { id }) => {
      // Simplification: only deleting the book record here for now.
      // Full implementation should handle file deletion if requested.
      await Book.deleteOne({ _id: id });
      return { success: true, deletedId: id };
    },
  },
};
