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

export const resolvers = {
  Book: {
    id: (parent) => parent._id.toString(),
    publishedDate: (parent) => parent.publishedDate?.toISOString(),
    dateAdded: (parent) => parent.dateAdded?.toISOString(),
    dateStarted: (parent) => parent.dateStarted?.toISOString(),
    dateFinished: (parent) => parent.dateFinished?.toISOString(),
    createdAt: (parent) => parent.createdAt?.toISOString(),
    updatedAt: (parent) => parent.updatedAt?.toISOString(),
  },
  BookFile: {
    addedAt: (parent) => parent.addedAt?.toISOString(),
  },
  Query: {
    books: async (_, { page = 1, limit = 50, sort = "title", sortDir = "asc", author, tag, shelf, owned, q }) => {
      const pageNum = Math.max(1, page);
      const limitNum = Math.max(1, Math.min(100, limit));

      const andConds = [];
      if (author) andConds.push({ authors: { $regex: author, $options: "i" } });
      if (tag) andConds.push({ tags: tag });
      if (shelf) {
        if (shelf === "unread") {
          andConds.push({
            $or: [
              { shelf: "unread" },
              { shelf: { $exists: false } },
              { shelf: null },
              { shelf: "" },
            ],
          });
        } else {
          andConds.push({ shelf });
        }
      }
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
      const [total, owned, shelfCounts, unshelvedCount] = await Promise.all([
        Book.countDocuments({}),
        Book.countDocuments({ owned: true }),
        Book.aggregate([
          { $match: { shelf: { $in: shelfNames } } },
          { $group: { _id: "$shelf", count: { $sum: 1 } } },
        ]),
        Book.countDocuments({
          $or: [
            { shelf: { $exists: false } },
            { shelf: null },
            { shelf: "" },
          ],
        }),
      ]);

      const counts = {};
      shelfNames.forEach((n) => (counts[n] = 0));
      shelfCounts.forEach((row) => {
        if (row._id) counts[row._id] = row.count;
      });
      if (unshelvedCount > 0) counts["unread"] = (counts["unread"] || 0) + unshelvedCount;

      return {
        total,
        owned,
        unowned: Math.max(0, total - owned),
        shelves: Object.entries(counts).map(([id, count]) => ({ id, count })),
      };
    },
  },
  Mutation: {
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
