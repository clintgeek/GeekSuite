/**
 * Bytes and long jobs for one book: cover upload/pick/delete/serve, cover
 * search, file attach, download (with on-demand conversion), metadata
 * enrich, Goodreads merge, send-to-Kindle, and DELETE /api/books/:id (the
 * only code that removes a book's files from disk). Plain data is GraphQL on
 * basegeek's gateway — see DOCS/CONTEXT.md "Which calls go where".
 *
 * Registration order is server.js's original order; keep it.
 */
import express from "express";
import fs from "fs";
import multer from "multer";
import path from "path";
import { Book } from "../models/book.js";
import { Profile } from "../models/profile.js";
import {
  libraryRoot as libraryRootPath,
  resolveInLibrary,
  safePathSegment,
} from "../libraryPaths.js";
import { fetchImageBuffer, isAllowedCoverHost } from "../coverFetch.js";
import { logger } from "../utils/logger.js";
import { ensureFormat, EnsureFormatError } from "../ebookFormats.js";
import { authenticateToken } from "../middleware/auth.js";
import { sendMail } from "../services/emailService.js";
import { validate } from "../validation/validate.js";
import { bookIdParamsSchema } from "../validation/schemas/books.js";
import {
  searchCoversQuerySchema,
  manualCoverBodySchema,
} from "../validation/schemas/covers.js";
import { mergeBodySchema } from "../validation/schemas/enrichMerge.js";
import { downloadParamsSchema } from "../validation/schemas/kindle.js";
import { dbConnected, tempPath } from "../config.js";
import { authenticateTokenOrKindle } from "../kindleUi.js";
import {
  downloadOpenLibraryCover,
  moveFileSafe,
  resolveCoverRelativePathForBook,
} from "../services/coverFiles.js";
import {
  extractOpenLibraryDescription,
  fetchJson,
  fetchOpenLibraryByIsbn,
  fetchOpenLibraryByTitleAuthor,
  normalizeDescription,
  normalizeIsbn,
  shouldReplaceDescription,
  tryCalibreEnrich,
} from "../services/enrichment.js";
import { cleanMyTags, deriveTagFields } from "../tags.js";

const router = express.Router();

// Built on first use rather than at import time: multer's disk storage
// mkdirs its destination when constructed, and importing this module (tests,
// tools/boot-smoke.mjs) must not touch /data. Same config as before.
let uploadInstance = null;
const uploadToTemp = {
  single(field) {
    return (req, res, next) => {
      if (!uploadInstance) {
        uploadInstance = multer({
          dest: tempPath(),
          limits: {
            fileSize: 200 * 1024 * 1024,
          },
        });
      }
      return uploadInstance.single(field)(req, res, next);
    };
  },
};

router.post(
  "/api/books/:id/cover/upload",
  authenticateToken,
  validate({ params: bookIdParamsSchema }),
  uploadToTemp.single("file"),
  async (req, res) => {
    try {
      if (!dbConnected()) {
        return res.status(503).json({ error: "Database not connected" });
      }

      const book = await Book.findById(req.params.id);
      if (!book) {
        if (req.file?.path) {
          await fs.promises.unlink(req.file.path).catch(() => { });
        }
        return res.status(404).json({ error: "Book not found" });
      }

      const file = req.file;
      if (!file || !file.path) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const ext = path
        .extname(file.originalname || file.filename || "")
        .toLowerCase();
      const safeExt = /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : ".jpg";
      const filename = `${ String(book._id) }-upload-${ Date.now() }${ safeExt }`;
      const relPath = resolveCoverRelativePathForBook(book, filename);
      const destPath = resolveInLibrary(relPath);
      if (!destPath) {
        await fs.promises.unlink(file.path).catch(() => { });
        return res.status(400).json({ error: "Cover path resolves outside the library" });
      }

      await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
      await moveFileSafe(file.path, destPath);

      book.coverPath = relPath;
      await book.save();

      const updatedBook = await Book.findById(book._id).lean();

      return res.json({
        success: true,
        data: {
          book: updatedBook,
        },
      });
    } catch (err) {
      console.error("/api/books/:id/cover/upload error", err);
      return res.status(500).json({ error: "Failed to upload cover" });
    }
  }
);

router.delete("/api/books/:id/cover", authenticateToken, validate({ params: bookIdParamsSchema }), async (req, res) => {
  try {
    if (!dbConnected()) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const book = await Book.findById(req.params.id);
    if (!book) {
      return res.status(404).json({ error: "Book not found" });
    }

    if (book.coverPath && typeof book.coverPath === "string") {
      const fullPath = resolveInLibrary(book.coverPath);
      if (fullPath) {
        await fs.promises.unlink(fullPath).catch(() => { });
      }
    }

    book.coverPath = undefined;
    await book.save();

    const updatedBook = await Book.findById(book._id).lean();

    return res.json({
      success: true,
      data: {
        book: updatedBook,
      },
    });
  } catch (err) {
    console.error("/api/books/:id/cover DELETE error", err);
    return res.status(500).json({ error: "Failed to delete cover" });
  }
});

router.post(
  "/api/books/:id/upload",
  authenticateToken,
  validate({ params: bookIdParamsSchema }),
  uploadToTemp.single("file"),
  async (req, res) => {
    try {
      if (!dbConnected()) {
        return res.status(503).json({ error: "Database not connected" });
      }

      const bookId = req.params.id;
      const file = req.file;

      if (!file || !file.path) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const book = await Book.findById(bookId);
      if (!book) {
        await fs.promises.unlink(file.path).catch(() => { });
        return res.status(404).json({ error: "Book not found" });
      }

      const libraryRoot = libraryRootPath();

      const ext = path.extname(file.originalname || "").toLowerCase();
      const baseName = path.basename(file.originalname || file.filename || "upload", ext) || "upload";
      const safeBase = safePathSegment(baseName, "upload");
      const safeExt = /^\.[a-zA-Z0-9]{1,8}$/.test(ext) ? ext.toLowerCase() : "";
      const finalName = safeBase + safeExt;
      const destDir = path.join(libraryRoot, "uploads", String(book._id));
      await fs.promises.mkdir(destDir, { recursive: true });
      const destPath = resolveInLibrary(path.join("uploads", String(book._id), finalName));
      if (!destPath) {
        await fs.promises.unlink(file.path).catch(() => { });
        return res.status(400).json({ error: "Upload path resolves outside the library" });
      }

      await moveFileSafe(file.path, destPath);

      const stats = await fs.promises.stat(destPath);
      if (!stats.isFile()) {
        return res.status(500).json({ error: "Uploaded file is not a regular file" });
      }

      const relPath = path.relative(libraryRoot, destPath);
      const extNoDot = ext.startsWith(".") ? ext.slice(1) : ext;
      const format = extNoDot ? extNoDot.toUpperCase() : "EPUB";

      const files = Array.isArray(book.files) ? [...book.files] : [];
      files.push({
        format,
        path: relPath,
        size: stats.size,
        addedAt: new Date(),
      });

      book.files = files;
      book.owned = true;

      await book.save();

      const updated = await Book.findById(bookId).lean();

      return res.json({ success: true, data: updated });
    } catch (err) {
      console.error("/api/books/:id/upload error", err);
      return res.status(500).json({ error: "Failed to attach file to book" });
    }
  }
);

router.get("/api/books/:id/download/:format", authenticateToken, validate({ params: downloadParamsSchema }), async (req, res) => {
  try {
    if (!dbConnected()) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const requestedFormat = String(req.params.format || "").toLowerCase();
    if (!requestedFormat || !["epub", "azw3", "mobi"].includes(requestedFormat)) {
      return res.status(400).json({ error: "Invalid format" });
    }

    const book = await Book.findById(req.params.id);
    if (!book) {
      return res.status(404).json({ error: "Book not found" });
    }

    let ensured;
    try {
      ensured = await ensureFormat(book, requestedFormat, {
        logTag: "/api/books/:id/download",
      });
    } catch (err) {
      if (err instanceof EnsureFormatError) {
        return res.status(err.status).json({ error: err.message });
      }
      throw err;
    }

    return res.download(ensured.fullPath, ensured.filename, (err) => {
      if (err) {
        console.error("/api/books/:id/download send error", err);
        if (!res.headersSent) {
          res.status(500).end();
        }
      }
    });
  } catch (err) {
    console.error("/api/books/:id/download error", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to download file" });
    }
  }
});

router.delete("/api/books/:id", authenticateToken, async (req, res) => {
  try {
    if (!dbConnected()) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const bookId = req.params.id;
    const book = await Book.findById(bookId).lean();
    if (!book) {
      return res.status(404).json({ error: "Book not found" });
    }

    const deleteFlag = String(req.query.deleteFiles || "").toLowerCase();
    const deleteFiles =
      deleteFlag === "true" ||
      deleteFlag === "1" ||
      deleteFlag === "yes" ||
      deleteFlag === "on";

    let filesDeleted = 0;
    let filesFailed = 0;

    if (deleteFiles) {
      const candidatePaths = [];

      if (Array.isArray(book.files)) {
        for (const f of book.files) {
          if (f && f.path) {
            const full = resolveInLibrary(f.path);
            if (full) candidatePaths.push(full);
          }
        }
      }

      if (book.coverPath) {
        const full = resolveInLibrary(book.coverPath);
        if (full) candidatePaths.push(full);
      }

      for (const fullPath of candidatePaths) {
        try {
          const stat = await fs.promises.stat(fullPath);
          if (!stat.isFile()) continue;

          await fs.promises.unlink(fullPath);
          filesDeleted += 1;
        } catch (err) {
          if (err.code !== "ENOENT") {
            console.warn("/api/books/:id delete file error", {
              bookId,
              fullPath,
              error: err.message,
            });
          }
          filesFailed += 1;
        }
      }
    }

    await Book.deleteOne({ _id: bookId }).exec();

    return res.json({
      success: true,
      data: {
        deletedId: bookId,
        deleteFilesRequested: deleteFiles,
        filesDeleted,
        filesFailed,
      },
    });
  } catch (err) {
    console.error("/api/books/:id DELETE error", err);
    return res.status(500).json({ error: "Failed to delete book" });
  }
});

router.post("/api/books/merge", authenticateToken, validate({ body: mergeBodySchema }), async (req, res) => {
  try {
    if (!dbConnected()) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const { primaryId, secondaryId } = req.body || {};
    if (!primaryId || !secondaryId || primaryId === secondaryId) {
      return res.status(400).json({
        error: "primaryId and secondaryId must be different book IDs",
      });
    }

    const [a, b] = await Promise.all([
      Book.findById(primaryId),
      Book.findById(secondaryId),
    ]);

    if (!a || !b) {
      return res.status(404).json({ error: "One or both books not found" });
    }

    const aIsGr = a.source === "goodreads-import";
    const bIsGr = b.source === "goodreads-import";

    if (aIsGr === bIsGr) {
      return res.status(400).json({
        error:
          "Manual merge requires exactly one Goodreads-import book and one primary library book.",
      });
    }

    const secondary = aIsGr ? a : b;
    const primary = aIsGr ? b : a;

    const update = {};

    if (
      (primary.rating === null || primary.rating === undefined) &&
      typeof secondary.rating === "number"
    ) {
      update.rating = secondary.rating;
    }

    if (!primary.review && secondary.review) {
      update.review = secondary.review;
    }

    if (!primary.dateFinished && secondary.dateFinished) {
      update.dateFinished = secondary.dateFinished;
    }

    if (!primary.dateAdded && secondary.dateAdded) {
      update.dateAdded = secondary.dateAdded;
    }

    if (
      (primary.readCount === null || primary.readCount === undefined) &&
      typeof secondary.readCount === "number" &&
      secondary.readCount > 0
    ) {
      update.readCount = secondary.readCount;
    }

    if (!primary.shelf && secondary.shelf) {
      update.shelf = secondary.shelf;
    }

    if (!primary.goodreadsId && secondary.goodreadsId) {
      update.goodreadsId = secondary.goodreadsId;
    }

    // Tags a person added in BookGeek are theirs wherever they were added:
    // the merged book keeps both books' (DOCS/TAGS.md §4).
    const primaryMine = Array.isArray(primary.myTags) ? [...primary.myTags] : [];
    const mergedMine = cleanMyTags([...primaryMine, ...(Array.isArray(secondary.myTags) ? secondary.myTags : [])]);
    if (mergedMine.length !== primaryMine.length) {
      update.myTags = mergedMine;
    }

    let updatedPrimary = primary;
    if (Object.keys(update).length > 0) {
      await Book.updateOne({ _id: primary._id }, { $set: update }).exec();
      updatedPrimary = await Book.findById(primary._id).lean();
    } else {
      updatedPrimary = await Book.findById(primary._id).lean();
    }

    await Book.deleteOne({ _id: secondary._id }).exec();

    return res.json({
      success: true,
      data: {
        primary: updatedPrimary,
        deletedId: secondary._id,
      },
    });
  } catch (err) {
    console.error("/api/books/merge error", err);
    return res.status(500).json({ error: "Failed to merge books" });
  }
});

router.get("/api/books/:id/cover", authenticateTokenOrKindle, validate({ params: bookIdParamsSchema }), async (req, res) => {
  try {
    if (!dbConnected()) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const book = await Book.findById(req.params.id).lean();
    if (!book) {
      return res.status(404).json({ error: "Cover not found" });
    }

    // Prefer the stored coverPath if present
    const candidatePaths = [];
    if (book.coverPath) {
      candidatePaths.push(book.coverPath);
    }

    // Fallback: derive the folder from the first file path and look for common cover names
    const coverNames = [
      "cover.jpg",
      "cover.jpeg",
      "cover.png",
      "cover.gif",
      "cover.webp",
    ];

    let baseDir = null;
    if (book.coverPath) {
      baseDir = path.dirname(book.coverPath);
    } else if (Array.isArray(book.files) && book.files.length > 0) {
      baseDir = path.dirname(book.files[0].path || "");
    }

    if (baseDir) {
      for (const name of coverNames) {
        const rel = path.join(baseDir, name);
        if (!candidatePaths.includes(rel)) {
          candidatePaths.push(rel);
        }
      }
    }

    for (const rel of candidatePaths) {
      const full = resolveInLibrary(rel);
      if (!full) continue;
      try {
        const stats = await fs.promises.stat(full);
        if (!stats.isFile()) continue;

        return res.sendFile(full, (sendErr) => {
          if (sendErr) {
            console.error("/api/books/:id/cover send error", sendErr);
            if (!res.headersSent) {
              res.status(500).end();
            }
          }
        });
      } catch (err) {
        if (err.code !== "ENOENT") {
          console.warn("/api/books/:id/cover stat error", {
            bookId: book._id?.toString?.(),
            full,
            error: err.message,
          });
        }
      }
    }

    return res.status(404).json({ error: "Cover not found" });
  } catch (err) {
    console.error("/api/books/:id/cover error", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to fetch cover" });
    }
  }
});

// The /api/profile/* routes (me, library-filters, shelves) lived here until
// 2026-09-05. They were pure data with no file or long-job work, so they moved
// to basegeek's gateway GraphQL (graphql/bookgeek/{typeDefs,resolvers}.js:
// bookProfile / libraryFilters queries, saveBookProfile / saveLibraryFilter /
// deleteLibraryFilter / addBookShelf / removeBookShelf mutations), which is
// where the web app now reads and writes them. The Profile MODEL stays: the
// send-to-kindle route below and deviceBasket.js both read it server-side.

router.post(
  "/api/books/:id/send-to-kindle",
  authenticateToken,
  validate({ params: bookIdParamsSchema }),
  async (req, res) => {
    try {
      if (!dbConnected()) {
        return res.status(503).json({ error: "Database not connected" });
      }

      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "User not available from token" });
      }

      const profile = await Profile.findOne({ userId }).lean();
      if (!profile || !profile.kindleEmail) {
        return res.status(400).json({ error: "Kindle email not configured" });
      }

      const book = await Book.findById(req.params.id).lean();
      if (!book) {
        return res.status(404).json({ error: "Book not found" });
      }

      let epubFile = null;
      if (Array.isArray(book.files)) {
        epubFile =
          book.files.find(
            (f) => String(f.format || "").toLowerCase() === "epub"
          ) ||
          book.files.find((f) => {
            const ext = path.extname(f.path || "").slice(1).toLowerCase();
            return ext === "epub";
          });
      }

      if (!epubFile) {
        return res.status(400).json({ error: "No EPUB format available" });
      }

      const fullPath = resolveInLibrary(epubFile.path);
      if (!fullPath) {
        return res
          .status(500)
          .json({ error: "Stored file path is outside the library" });
      }

      const kindleEnabled =
        String(process.env.KINDLE_ENABLED || "").toLowerCase() === "true";

      if (kindleEnabled) {
        try {
          const subject =
            book.title && typeof book.title === "string"
              ? `${ book.title } (BookGeek)`
              : "Book from BookGeek";

          const result = await sendMail({
            to: profile.kindleEmail,
            subject,
            text: "Kindle delivery from BookGeek.",
            html: `<p>Kindle delivery from <strong>BookGeek</strong>.</p>`,
            attachments: [
              {
                filename: path.basename(fullPath),
                path: fullPath,
                contentType: "application/epub+zip",
              },
            ],
          });

          logger.info(
            {
              userId,
              bookId: book._id?.toString?.(),
              filePath: epubFile.path,
              sent: result?.sent,
              reason: result?.reason,
            },
            "send-to-kindle smtp result"
          );

          if (!result?.sent) {
            // SMTP_* is unset, so sendMail no-opped. Reporting `success: true`
            // here made the UI say "Sent to Kindle" for a mail that never left
            // the box — the one failure mode a user cannot see for themselves.
            return res.status(502).json({
              success: false,
              error: {
                message:
                  result?.reason === "smtp_not_configured"
                    ? "Email delivery is not configured on the server (SMTP_*)."
                    : "Kindle email was not sent.",
                code: "KINDLE_SEND_FAILED",
              },
            });
          }

          return res.json({
            success: true,
            data: {
              sent: true,
              mode: "smtp",
              kindleEmail: profile.kindleEmail,
            },
          });
        } catch (mailErr) {
          console.error("send-to-kindle SMTP error", mailErr);
          return res
            .status(500)
            .json({ error: "Failed to send Kindle email via SMTP" });
        }
      }

      logger.info(
        {
          userId,
          bookId: book._id?.toString?.(),
          filePath: epubFile.path,
        },
        "send-to-kindle stub (KINDLE_ENABLED is not true)"
      );

      res.json({
        success: true,
        data: {
          sent: false,
          mode: "stub",
          kindleEmail: profile.kindleEmail,
        },
      });
    } catch (err) {
      console.error("/api/books/:id/send-to-kindle error", err);
      res.status(500).json({ error: "Failed to send to Kindle" });
    }
  }
);

router.get("/api/books/:id/search-covers", authenticateToken, validate({ params: bookIdParamsSchema, query: searchCoversQuerySchema }), async (req, res) => {
  try {
    if (!dbConnected()) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const book = await Book.findById(req.params.id).lean();
    if (!book) {
      return res.status(404).json({ error: "Book not found" });
    }

    const rawQ = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const title =
      rawQ || (typeof book.title === "string" ? book.title : "");
    const primaryAuthor =
      Array.isArray(book.authors) && book.authors.length > 0
        ? book.authors[0]
        : "";

    if (!title) {
      return res.json({
        success: true,
        data: { provider: "none", candidates: [] },
      });
    }

    const [openLibCandidates, googleCandidates] = await Promise.all([
      (async () => {
        try {
          const params = new URLSearchParams();
          params.set("title", title);
          if (primaryAuthor) params.set("author", primaryAuthor);
          params.set("limit", "12");

          const url = `https://openlibrary.org/search.json?${ params.toString() }`;
          const search = await fetchJson(url);
          const docs = Array.isArray(search?.docs) ? search.docs : [];

          return docs
            .filter(
              (doc) => typeof doc.cover_i === "number" && doc.cover_i > 0
            )
            .map((doc) => {
              const coverId = doc.cover_i;
              return {
                id: `openlibrary-${ coverId }`,
                source: "openlibrary",
                coverId,
                title: doc.title || null,
                authors: Array.isArray(doc.author_name) ? doc.author_name : [],
                firstPublishYear: doc.first_publish_year || null,
                thumbUrl: `https://covers.openlibrary.org/b/id/${ coverId }-M.jpg`,
                largeUrl: `https://covers.openlibrary.org/b/id/${ coverId }-L.jpg`,
              };
            });
        } catch {
          return [];
        }
      })(),
      (async () => {
        try {
          const qParts = [];
          if (title) qParts.push(`intitle:${ title }`);
          if (primaryAuthor) qParts.push(`inauthor:${ primaryAuthor }`);
          if (!qParts.length && title) qParts.push(title);

          const googleParams = new URLSearchParams();
          googleParams.set("q", qParts.join(" "));
          googleParams.set("maxResults", "12");
          if (process.env.GOOGLE_BOOKS_API_KEY) {
            googleParams.set("key", process.env.GOOGLE_BOOKS_API_KEY);
          }

          const googleUrl = `https://www.googleapis.com/books/v1/volumes?${ googleParams.toString() }`;
          const search = await fetchJson(googleUrl);
          const items = Array.isArray(search?.items) ? search.items : [];

          return items
            .map((item) => {
              const info = item?.volumeInfo || {};
              const links = info.imageLinks || {};
              const thumb = links.thumbnail || links.smallThumbnail;
              if (!thumb) return null;
              return {
                id: `googlebooks-${ item.id || thumb }`,
                source: "googlebooks",
                title: info.title || null,
                authors: Array.isArray(info.authors) ? info.authors : [],
                firstPublishYear: info.publishedDate || null,
                thumbUrl: thumb,
                largeUrl: links.large || links.medium || thumb,
                coverUrl: thumb,
              };
            })
            .filter(Boolean);
        } catch {
          return [];
        }
      })(),
    ]);

    const candidates = [...openLibCandidates, ...googleCandidates];

    return res.json({
      success: true,
      data: {
        provider: "mixed",
        candidates,
      },
    });
  } catch (err) {
    console.error("/api/books/:id/search-covers error", err);
    return res.status(500).json({ error: "Failed to search covers" });
  }
});

router.post("/api/books/:id/cover", authenticateToken, validate({ params: bookIdParamsSchema, body: manualCoverBodySchema }), async (req, res) => {
  try {
    if (!dbConnected()) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const book = await Book.findById(req.params.id);
    if (!book) {
      return res.status(404).json({ error: "Book not found" });
    }

    const provider =
      typeof req.body?.provider === "string" && req.body.provider
        ? req.body.provider
        : "openlibrary";

    let newCoverPath = null;

    if (provider === "openlibrary") {
      const coverId = req.body?.coverId;
      if (!coverId) {
        return res.status(400).json({ error: "coverId is required" });
      }
      newCoverPath = await downloadOpenLibraryCover(coverId, book);
    } else if (provider === "googlebooks") {
      const coverUrlRaw = req.body?.coverUrl;
      const coverUrl =
        typeof coverUrlRaw === "string" ? coverUrlRaw.trim() : "";
      if (!coverUrl) {
        return res.status(400).json({ error: "coverUrl is required" });
      }
      if (!isAllowedCoverHost(coverUrl)) {
        return res
          .status(400)
          .json({ error: "coverUrl must be an https Google Books cover URL" });
      }

      try {
        const buffer = await fetchImageBuffer(coverUrl);
        if (!buffer) {
          return res
            .status(502)
            .json({ error: "Failed to download cover image" });
        }

        const libraryRoot = libraryRootPath();

        const filename = `${ String(book._id) }-gb-${ Date.now() }.jpg`;
        const relPath = resolveCoverRelativePathForBook(book, filename);
        const destPath = resolveInLibrary(relPath, libraryRoot);
        if (!destPath) {
          return res
            .status(400)
            .json({ error: "Cover path resolves outside the library" });
        }
        await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
        await fs.promises.writeFile(destPath, buffer);
        newCoverPath = path.relative(libraryRoot, destPath);
      } catch (err) {
        console.error("googlebooks cover download error", err);
        return res
          .status(502)
          .json({ error: "Failed to download cover image" });
      }
    } else {
      return res.status(400).json({ error: "Unsupported cover provider" });
    }
    if (!newCoverPath) {
      return res
        .status(502)
        .json({ error: "Failed to download cover image" });
    }

    book.coverPath = newCoverPath;
    await book.save();

    const updatedBook = await Book.findById(book._id).lean();

    return res.json({
      success: true,
      data: {
        book: updatedBook,
        provider,
      },
    });
  } catch (err) {
    console.error("/api/books/:id/cover error", err);
    return res.status(500).json({ error: "Failed to update cover" });
  }
});

router.post("/api/books/:id/enrich", authenticateToken, validate({ params: bookIdParamsSchema }), async (req, res) => {
  try {
    if (!dbConnected()) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const book = await Book.findById(req.params.id);
    if (!book) {
      return res.status(404).json({ error: "Book not found" });
    }

    const isbnCandidate = normalizeIsbn(book.isbn13 || book.isbn);
    const title = typeof book.title === "string" ? book.title : null;
    const primaryAuthor =
      Array.isArray(book.authors) && book.authors.length > 0
        ? book.authors[0]
        : null;

    const updatedFields = [];
    const update = {};
    const sourceParts = [];

    await tryCalibreEnrich(book, update, updatedFields, sourceParts);

    let external = null;
    let olSource = null;

    if (isbnCandidate) {
      try {
        external = await fetchOpenLibraryByIsbn(isbnCandidate);
        if (external) {
          olSource = "openlibrary-isbn";
        }
      } catch (err) {
        console.warn("Open Library ISBN enrichment failed", {
          isbn: isbnCandidate,
          error: err?.message || String(err),
        });
        external = null;
      }
    }

    if (!external && title && primaryAuthor) {
      try {
        external = await fetchOpenLibraryByTitleAuthor(title, primaryAuthor);
        if (external) {
          olSource = "openlibrary-search";
        }
      } catch (err) {
        console.warn("Open Library search enrichment failed", {
          title,
          author: primaryAuthor,
          error: err?.message || String(err),
        });
        external = null;
      }
    }

    if (external) {
      let olChanged = false;

      const description = normalizeDescription(
        extractOpenLibraryDescription(external.description)
      );
      const currentDescription =
        typeof update.description === "string" ? update.description : book.description;
      if (
        description &&
        shouldReplaceDescription(currentDescription, description) &&
        update.description !== description
      ) {
        update.description = description;
        if (!updatedFields.includes("description")) {
          updatedFields.push("description");
        }
        olChanged = true;
      }

      if (
        !book.publisher &&
        !update.publisher &&
        Array.isArray(external.publishers) &&
        external.publishers.length > 0
      ) {
        const firstPub = external.publishers[0];
        if (typeof firstPub === "string") {
          update.publisher = firstPub;
        } else if (firstPub && typeof firstPub.name === "string") {
          update.publisher = firstPub.name;
        }
        if (update.publisher) {
          updatedFields.push("publisher");
          olChanged = true;
        }
      }

      if (!book.publishedDate && !update.publishedDate && external.publish_date) {
        const d = new Date(external.publish_date);
        if (!Number.isNaN(d.getTime())) {
          update.publishedDate = d;
          updatedFields.push("publishedDate");
          olChanged = true;
        }
      }

      if (
        (book.pageCount === null || book.pageCount === undefined) &&
        update.pageCount === undefined &&
        typeof external.number_of_pages === "number" &&
        external.number_of_pages > 0
      ) {
        update.pageCount = external.number_of_pages;
        updatedFields.push("pageCount");
        olChanged = true;
      }

      if (!book.language && !update.language && typeof external.language === "string") {
        update.language = external.language;
        updatedFields.push("language");
        olChanged = true;
      }

      if (Array.isArray(external.subjects) && external.subjects.length > 0) {
        const existingTags = Array.isArray(update.tags)
          ? update.tags
          : Array.isArray(book.tags)
            ? book.tags
            : [];
        const newTags = external.subjects
          .map((s) =>
            typeof s === "string"
              ? s
              : s && typeof s.name === "string"
                ? s.name
                : null
          )
          .filter(Boolean);
        if (newTags.length > 0) {
          const merged = Array.from(new Set([...existingTags, ...newTags]));
          update.tags = merged;
          updatedFields.push("tags");
          olChanged = true;
        }
      }

      if (
        (!book.coverPath || typeof book.coverPath !== "string") &&
        !update.coverPath &&
        Array.isArray(external.covers) &&
        external.covers.length > 0
      ) {
        const coverId = external.covers[0];
        const coverPath = await downloadOpenLibraryCover(coverId, book);
        if (coverPath) {
          update.coverPath = coverPath;
          updatedFields.push("coverPath");
          olChanged = true;
        }
      }

      if (olChanged && olSource) {
        sourceParts.push(olSource);
      }
    }

    if (Object.keys(update).length === 0) {
      const leanBook = await Book.findById(book._id).lean();
      if (sourceParts.length === 0) {
        return res.status(404).json({
          success: false,
          error: { message: "No external metadata found for this book" },
        });
      }
      return res.json({
        success: true,
        data: {
          book: leanBook,
          updatedFields: [],
          source: sourceParts.join(","),
        },
      });
    }

    // Enrich merges provider subjects into the raw `tags` (they are an
    // import, like Calibre's); the canonical and Unsorted fields follow in
    // the same $set (DOCS/TAGS.md).
    if (Array.isArray(update.tags)) Object.assign(update, deriveTagFields(update.tags));

    await Book.updateOne({ _id: book._id }, { $set: update }).exec();
    const updatedBook = await Book.findById(book._id).lean();

    return res.json({
      success: true,
      data: {
        book: updatedBook,
        updatedFields,
        source: sourceParts.join(","),
      },
    });
  } catch (err) {
    console.error("/api/books/:id/enrich error", err);
    return res.status(500).json({ error: "Failed to enrich metadata" });
  }
});

export default router;
