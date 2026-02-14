import express from "express";
import { Database } from "bun:sqlite";
import fs from "fs/promises";
import path from "path";
import multer from "multer";
import { parse as parseCsv } from "csv-parse/sync";
import { execFile } from "child_process";
import { promisify } from "util";
import { Book } from "../models/book.js";
import { authenticateToken } from "../middleware/auth.js";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const CALIBRE_EBOOK_META_BIN =
  process.env.CALIBRE_EBOOK_META_BIN || "ebook-meta";

const ADDME_PATH = process.env.ADDME_PATH || "/data/addMe";
const LIBRARY_PATH = process.env.LIBRARY_PATH || "/data/library";

const execFileAsync = promisify(execFile);

// One-time Calibre import
// - Treats LIBRARY_PATH (/data/library) as the canonical Calibre-style library root
// - Reads full metadata from Calibre's metadata.db in that root
// - Scans for existing book files and covers without copying
// - Creates Book documents with files, coverPath, and rich metadata
router.post("/calibre", async (req, res) => {
  try {
    const libraryRoot = process.env.LIBRARY_PATH || "/data/library";
    const dbPath = path.join(libraryRoot, "metadata.db");
    const limitParam = req.query.limit;
    const limit = Number(limitParam) > 0 ? Number(limitParam) : 1000;

    // Reset any previous Calibre-imported books so this route can be safely re-run
    await Book.deleteMany({ source: "calibre-import" });
    const db = new Database(dbPath);

    const baseQuery = db.query(`
      SELECT
        b.id AS id,
        b.title AS title,
        b.isbn AS isbn,
        b.pubdate AS pubdate,
        b.path AS path,
        b.series_index AS series_index,
        GROUP_CONCAT(a.name, '||') AS authors
      FROM books b
      LEFT JOIN books_authors_link bal ON b.id = bal.book
      LEFT JOIN authors a ON bal.author = a.id
      GROUP BY b.id
      ORDER BY b.id
      LIMIT ?;
    `);

    const rows = baseQuery.all(limit);

    if (!rows || rows.length === 0) {
      db.close();
      return res.json({ success: true, imported: 0 });
    }

async function getCalibreFileMetadata(filePath) {
  if (!filePath) return null;
  try {
    const { stdout } = await execFileAsync(CALIBRE_EBOOK_META_BIN, [filePath], {
      maxBuffer: 1024 * 1024,
      timeout: 15000,
    });
    return parseEbookMetaOutput(stdout);
  } catch (err) {
    if (err && (err.code === "ENOENT" || err.killed)) {
      console.warn("Calibre ebook-meta not available or timed out", {
        error: err.message,
      });
      return null;
    }
    console.warn("Calibre ebook-meta failed", {
      error: err.message,
    });
    return null;
  }
}

function parseEbookMetaOutput(text) {
  if (!text) return null;
  const lines = String(text).split(/\r?\n/);
  const meta = {};
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (!value) continue;
    if (key === "title") {
      meta.title = value;
    } else if (key === "author(s)") {
      const parts = value
        .split("&")
        .join(",")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.length > 0) {
        meta.authors = parts;
      }
    } else if (key === "publisher") {
      meta.publisher = value;
    } else if (key === "languages") {
      const lang = value.split(",")[0].trim();
      if (lang) {
        meta.language = lang;
      }
    } else if (key === "tags") {
      const tags = value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (tags.length > 0) {
        meta.tags = tags;
      }
    } else if (key === "published") {
      meta.published = value;
    } else if (key === "identifiers") {
      const ids = value.match(/\b[0-9Xx]{10,13}\b/g);
      if (ids && ids.length > 0) {
        for (const id of ids) {
          const digits = id.replace(/[^0-9Xx]/g, "");
          if (digits.length === 13 && !meta.isbn13) {
            meta.isbn13 = digits;
          } else if (digits.length === 10 && !meta.isbn) {
            meta.isbn = digits;
          }
        }
      }
    }
  }
  return meta;
}

    const docs = [];

    for (const row of rows) {
      const bookId = row.id;

      // Authors
      const authors =
        row.authors && typeof row.authors === "string"
          ? row.authors
              .split("||")
              .map((s) => s.trim())
              .filter(Boolean)
          : [];

      // Series (name from series table, index from books.series_index)
      const seriesQuery = db.query(
        `SELECT s.name AS name FROM books_series_link bsl JOIN series s ON bsl.series = s.id WHERE bsl.book = ? LIMIT 1;`
      );
      const seriesRow = seriesQuery.get(bookId);

      const series = seriesRow
        ? {
            name: seriesRow.name,
            index: typeof row.series_index === "number" ? row.series_index : undefined,
          }
        : undefined;

      // Tags
      const tagsQuery = db.query(
        `SELECT t.name AS name FROM books_tags_link btl JOIN tags t ON btl.tag = t.id WHERE btl.book = ?;`
      );
      const tagRows = tagsQuery.all(bookId) || [];
      const tags = tagRows
        .map((t) => (t.name || "").trim())
        .filter(Boolean);

      // Comments / description
      const commentsQuery = db.query(
        `SELECT text FROM comments WHERE book = ? LIMIT 1;`
      );
      const commentsRow = commentsQuery.get(bookId);
      const description = commentsRow?.text || undefined;

      // Publisher
      const pubQuery = db.query(
        `SELECT p.name AS name FROM books_publishers_link bpl JOIN publishers p ON bpl.publisher = p.id WHERE bpl.book = ? LIMIT 1;`
      );
      const pubRow = pubQuery.get(bookId);
      const publisher = pubRow?.name || undefined;

      // Language (first language only)
      const langQuery = db.query(
        `SELECT l.lang_code AS code FROM books_languages_link bll JOIN languages l ON bll.lang_code = l.lang_code WHERE bll.book = ? LIMIT 1;`
      );
      const langRow = langQuery.get(bookId);
      const language = langRow?.code || undefined;

      // Identifiers
      const idQuery = db.query(
        `SELECT type, val FROM identifiers WHERE book = ?;`
      );
      const idRows = idQuery.all(bookId) || [];

      let goodreadsId;
      let openLibraryId;
      let asin;
      let googleBooksId;
      let isbn = row.isbn || undefined;

      for (const ident of idRows) {
        const type = (ident.type || "").toLowerCase();
        const val = ident.val;
        if (!val) continue;

        if (!isbn && (type === "isbn" || type === "isbn13")) {
          isbn = val;
        } else if (!goodreadsId && type.includes("goodreads")) {
          goodreadsId = val;
        } else if (!openLibraryId && (type === "olid" || type.includes("openlibrary"))) {
          openLibraryId = val;
        } else if (!asin && type === "asin") {
          asin = val;
        } else if (!googleBooksId && (type === "google" || type === "googlebooks")) {
          googleBooksId = val;
        }
      }

      // Files (all formats) from Calibre's data table
      const dataQuery = db.query(
        `SELECT format, name, uncompressed_size FROM data WHERE book = ?;`
      );
      const dataRows = dataQuery.all(bookId) || [];

      const files = [];
      const calibreBookPath = row.path; // relative path under the library root

      for (const d of dataRows) {
        if (!d.format || !d.name) continue;

        const format = String(d.format).toLowerCase();
        const fileName = `${d.name}.${format}`;
        const relPath = path.join(calibreBookPath, fileName);
        const fullPath = path.join(libraryRoot, relPath);

        try {
          const stat = await fs.stat(fullPath);
          if (!stat.isFile()) continue;

          files.push({
            format: format.toUpperCase(),
            path: relPath,
            size: stat.size,
            addedAt: new Date(),
          });
        } catch (err) {
          // If a specific format is missing or path is odd, skip it but continue
          console.warn("File missing or invalid during scan", {
            bookId,
            fullPath,
            error: err.message,
          });
        }
      }

      // Fallback: if no files were found via the data table, scan the folder on disk
      if (files.length === 0 && calibreBookPath) {
        try {
          const folderFull = path.join(libraryRoot, calibreBookPath);
          const entries = await fs.readdir(folderFull, { withFileTypes: true });
          const allowedExts = [
            "epub",
            "mobi",
            "azw3",
            "pdf",
            "fb2",
            "rtf",
            "txt",
            "html",
          ];

          for (const entry of entries) {
            if (!entry.isFile()) continue;
            const ext = path.extname(entry.name).slice(1).toLowerCase();
            if (!allowedExts.includes(ext)) continue;

            const relPath = path.join(calibreBookPath, entry.name);
            const fullPath = path.join(libraryRoot, relPath);
            try {
              const stat = await fs.stat(fullPath);
              if (!stat.isFile()) continue;
              files.push({
                format: ext.toUpperCase(),
                path: relPath,
                size: stat.size,
                addedAt: new Date(),
              });
            } catch (err) {
              console.warn("Folder scan file stat failed", {
                bookId,
                fullPath,
                error: err.message,
              });
            }
          }
        } catch (err) {
          console.warn("Folder scan for files failed", {
            bookId,
            calibreBookPath,
            error: err.message,
          });
        }
      }

      // Cover (if present) - look for a common image extension alongside the book files
      let coverPath;
      const coverCandidates = [
        "cover.jpg",
        "cover.jpeg",
        "cover.png",
        "cover.gif",
        "cover.webp",
      ];

      for (const name of coverCandidates) {
        const relCoverPath = path.join(calibreBookPath, name);
        const fullCoverPath = path.join(libraryRoot, relCoverPath);
        try {
          const coverStat = await fs.stat(fullCoverPath);
          if (coverStat.isFile()) {
            coverPath = relCoverPath;
            break;
          }
        } catch (err) {
          if (err.code !== "ENOENT") {
            console.warn("Error while checking cover", {
              bookId,
              fullCoverPath,
              error: err.message,
            });
          }
        }
      }

      const doc = {
        title: row.title || "Untitled",
        authors,
        series,
        isbn: isbn || undefined,
        isbn13: undefined, // can be filled later from external lookups if needed
        goodreadsId,
        openLibraryId,
        asin,
        googleBooksId,
        publisher,
        publishedDate: row.pubdate ? new Date(row.pubdate) : undefined,
        description,
        language,
        tags,
        files,
        coverPath,
        owned: files.length > 0,
        shelf: undefined,
        rating: undefined,
        review: undefined,
        dateAdded: new Date(),
        source: "calibre-import",
      };

      docs.push(doc);
    }

    db.close();

    const result = await Book.insertMany(docs, { ordered: false });

    return res.json({
      success: true,
      imported: result.length,
    });
  } catch (error) {
    console.error("Calibre import failed", error);
    return res.status(500).json({
      success: false,
      error: {
        message: "Calibre import failed",
        details: error.message,
      },
    });
  }
});

// Non-destructive Calibre rescan
// - Reads Calibre metadata.db under LIBRARY_PATH
// - For each Calibre book, finds existing Book docs by ISBN / Goodreads ID / title+author
// - Attaches any missing files and coverPath from the filesystem and marks owned: true
// - Only creates new Book docs when no existing match is found
router.post("/calibre/rescan", authenticateToken, async (req, res) => {
  try {
    const libraryRoot = process.env.LIBRARY_PATH || "/data/library";
    const dbPath = path.join(libraryRoot, "metadata.db");
    const limitParam = req.query.limit;
    const limit = Number(limitParam) > 0 ? Number(limitParam) : 1000;

    const db = new Database(dbPath);

    const baseQuery = db.query(`
      SELECT
        b.id AS id,
        b.title AS title,
        b.isbn AS isbn,
        b.pubdate AS pubdate,
        b.path AS path,
        b.series_index AS series_index,
        GROUP_CONCAT(a.name, '||') AS authors
      FROM books b
      LEFT JOIN books_authors_link bal ON b.id = bal.book
      LEFT JOIN authors a ON bal.author = a.id
      GROUP BY b.id
      ORDER BY b.id
      LIMIT ?;
    `);

    const rows = baseQuery.all(limit);

    if (!rows || rows.length === 0) {
      db.close();
      return res.json({
        success: true,
        data: {
          rows: 0,
          attachedExisting: 0,
          createdNew: 0,
          skippedNoFiles: 0,
        },
      });
    }

    let attachedExisting = 0;
    let createdNew = 0;
    let skippedNoFiles = 0;

    for (const row of rows) {
      const bookId = row.id;

      // Authors
      const authors =
        row.authors && typeof row.authors === "string"
          ? row.authors
              .split("||")
              .map((s) => s.trim())
              .filter(Boolean)
          : [];

      // Tags
      const tagsQuery = db.query(
        `SELECT t.name AS name FROM books_tags_link btl JOIN tags t ON btl.tag = t.id WHERE btl.book = ?;`
      );
      const tagRows = tagsQuery.all(bookId) || [];
      const tags = tagRows
        .map((t) => (t.name || "").trim())
        .filter(Boolean);

      // Publisher
      const pubQuery = db.query(
        `SELECT p.name AS name FROM books_publishers_link bpl JOIN publishers p ON bpl.publisher = p.id WHERE bpl.book = ? LIMIT 1;`
      );
      const pubRow = pubQuery.get(bookId);
      const publisher = pubRow?.name || undefined;

      // Language
      const langQuery = db.query(
        `SELECT l.lang_code AS code FROM books_languages_link bll JOIN languages l ON bll.lang_code = l.lang_code WHERE bll.book = ? LIMIT 1;`
      );
      const langRow = langQuery.get(bookId);
      const language = langRow?.code || undefined;

      // Identifiers
      const idQuery = db.query(
        `SELECT type, val FROM identifiers WHERE book = ?;`
      );
      const idRows = idQuery.all(bookId) || [];

      let goodreadsId;
      let openLibraryId;
      let asin;
      let googleBooksId;
      let isbn = row.isbn || undefined;

      for (const ident of idRows) {
        const type = (ident.type || "").toLowerCase();
        const val = ident.val;
        if (!val) continue;

        if (!isbn && (type === "isbn" || type === "isbn13")) {
          isbn = val;
        } else if (!goodreadsId && type.includes("goodreads")) {
          goodreadsId = val;
        } else if (!openLibraryId && (type === "olid" || type.includes("openlibrary"))) {
          openLibraryId = val;
        } else if (!asin && type === "asin") {
          asin = val;
        } else if (!googleBooksId && (type === "google" || type === "googlebooks")) {
          googleBooksId = val;
        }
      }

      // Files (all formats) from Calibre's data table
      const dataQuery = db.query(
        `SELECT format, name, uncompressed_size FROM data WHERE book = ?;`
      );
      const dataRows = dataQuery.all(bookId) || [];

      const files = [];
      const calibreBookPath = row.path; // relative path under the library root

      for (const d of dataRows) {
        if (!d.format || !d.name) continue;

        const format = String(d.format).toLowerCase();
        const fileName = `${d.name}.${format}`;
        const relPath = path.join(calibreBookPath, fileName);
        const fullPath = path.join(libraryRoot, relPath);

        try {
          const stat = await fs.stat(fullPath);
          if (!stat.isFile()) continue;

          files.push({
            format: format.toUpperCase(),
            path: relPath,
            size: stat.size,
            addedAt: new Date(),
          });
        } catch (err) {
          console.warn("File missing or invalid during rescan", {
            bookId,
            fullPath,
            error: err.message,
          });
        }
      }

      // Fallback: if no files were found via the data table, scan the folder on disk
      if (files.length === 0 && calibreBookPath) {
        try {
          const folderFull = path.join(libraryRoot, calibreBookPath);
          const entries = await fs.readdir(folderFull, { withFileTypes: true });
          const allowedExts = [
            "epub",
            "mobi",
            "azw3",
            "pdf",
            "fb2",
            "rtf",
            "txt",
            "html",
          ];

          for (const entry of entries) {
            if (!entry.isFile()) continue;
            const ext = path.extname(entry.name).slice(1).toLowerCase();
            if (!allowedExts.includes(ext)) continue;

            const relPath = path.join(calibreBookPath, entry.name);
            const fullPath = path.join(libraryRoot, relPath);
            try {
              const stat = await fs.stat(fullPath);
              if (!stat.isFile()) continue;
              files.push({
                format: ext.toUpperCase(),
                path: relPath,
                size: stat.size,
                addedAt: new Date(),
              });
            } catch (err) {
              console.warn("Folder scan file stat failed during rescan", {
                bookId,
                fullPath,
                error: err.message,
              });
            }
          }
        } catch (err) {
          console.warn("Folder scan for files failed during rescan", {
            bookId,
            calibreBookPath,
            error: err.message,
          });
        }
      }

      if (files.length === 0) {
        skippedNoFiles += 1;
        continue;
      }

      // Cover (if present)
      let coverPath;
      const coverCandidates = [
        "cover.jpg",
        "cover.jpeg",
        "cover.png",
        "cover.gif",
        "cover.webp",
      ];

      for (const name of coverCandidates) {
        const relCoverPath = path.join(calibreBookPath, name);
        const fullCoverPath = path.join(libraryRoot, relCoverPath);
        try {
          const coverStat = await fs.stat(fullCoverPath);
          if (coverStat.isFile()) {
            coverPath = relCoverPath;
            break;
          }
        } catch (err) {
          if (err.code !== "ENOENT") {
            console.warn("Error while checking cover during rescan", {
              bookId,
              fullCoverPath,
              error: err.message,
            });
          }
        }
      }

      // Try to find an existing Book for this Calibre entry
      let book = null;

      const normIsbn = normalizeIsbn(isbn);
      if (normIsbn) {
        book =
          (await Book.findOne({ isbn: normIsbn }).exec()) ||
          (await Book.findOne({ isbn13: normIsbn }).exec());
      }

      if (!book && goodreadsId) {
        book = await Book.findOne({ goodreadsId }).exec();
      }

      if (!book && row.title && authors.length > 0) {
        const titleRaw = row.title;
        const primaryAuthor = authors[0];

        const titleRegex = new RegExp("^" + escapeRegex(titleRaw) + "$", "i");
        const authorRegex = new RegExp(escapeRegex(primaryAuthor), "i");

        book = await Book.findOne({
          title: titleRegex,
          authors: authorRegex,
        }).exec();
      }

      if (book) {
        const existingFiles = Array.isArray(book.files) ? book.files : [];
        const mergedFiles = [...existingFiles];

        for (const nf of files) {
          if (!mergedFiles.some((f) => f.path === nf.path)) {
            mergedFiles.push(nf);
          }
        }

        const update = {
          files: mergedFiles,
          owned: true,
        };

        if (coverPath && !book.coverPath) {
          update.coverPath = coverPath;
        }

        await Book.updateOne({ _id: book._id }, { $set: update }).exec();
        attachedExisting += 1;
        continue;
      }

      // No existing match: create a new Book doc for this Calibre entry
      const doc = {
        title: row.title || "Untitled",
        authors,
        isbn: isbn || undefined,
        isbn13: undefined,
        goodreadsId,
        openLibraryId,
        asin,
        googleBooksId,
        publisher,
        publishedDate: row.pubdate ? new Date(row.pubdate) : undefined,
        language,
        tags,
        files,
        coverPath,
        owned: files.length > 0,
        shelf: undefined,
        rating: undefined,
        review: undefined,
        dateAdded: new Date(),
        source: "calibre-import",
      };

      await Book.create(doc);
      createdNew += 1;
    }

    db.close();

    return res.json({
      success: true,
      data: {
        attachedExisting,
        createdNew,
        failed,
      },
    });
  } catch (error) {
    console.error("Readarr addMe import failed", error);
    return res.status(500).json({
      success: false,
      error: {
        message: "Readarr addMe import failed",
        details: error.message,
      },
    });
  }
});

function normalizeIsbn(value) {
  if (!value) return null;
  const digits = String(value).replace(/[^0-9Xx]/g, "");
  return digits || null;
}

// ... (rest of the code remains the same)
function parseGoodreadsDate(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const ts = Date.parse(trimmed);
  if (Number.isNaN(ts)) return null;
  return new Date(ts);
}

function mapGoodreadsShelf(exclusiveShelf) {
  if (!exclusiveShelf) return null;
  const shelf = String(exclusiveShelf).toLowerCase();
  if (shelf === "read") return "read";
  if (shelf === "to-read" || shelf === "wishlist") return "want-to-read";
  if (shelf === "currently-reading" || shelf === "reading") return "reading";
  if (["abandoned", "dnf", "did-not-finish", "stopped-reading"].includes(shelf)) {
    return "abandoned";
  }
  return null;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeTextForMatch(value) {
  if (!value) return null;
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function getPrimaryAuthorName(authors) {
  if (!Array.isArray(authors) || authors.length === 0) return null;
  const raw = authors[0] || "";
  const beforeComma = raw.split(",")[0];
  return beforeComma || raw;
}

function pickBestPrimaryCandidate(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;

  let best = null;
  for (const c of candidates) {
    if (!best) {
      best = c;
      continue;
    }

    const bestOwned = !!best.owned;
    const cOwned = !!c.owned;
    if (bestOwned !== cOwned) {
      best = cOwned ? c : best;
      continue;
    }

    const bestCalibre = best.source === "calibre-import";
    const cCalibre = c.source === "calibre-import";
    if (bestCalibre !== cCalibre) {
      best = cCalibre ? c : best;
      continue;
    }
  }

  return best;
}

function findPrimaryForGoodreads(goodreadsDoc, primaries) {
  if (!Array.isArray(primaries) || primaries.length === 0) return null;

  const goodreadsId = goodreadsDoc.goodreadsId;
  const selfId = goodreadsDoc._id ? String(goodreadsDoc._id) : null;

  const isNotSelf = (doc) => {
    if (!selfId || !doc._id) return true;
    return String(doc._id) !== selfId;
  };

  // 1) Prefer explicit Goodreads ID match
  if (goodreadsId) {
    const byGrIdCandidates = primaries.filter(
      (p) => isNotSelf(p) && p.goodreadsId === goodreadsId
    );
    const pickedByGrId = pickBestPrimaryCandidate(byGrIdCandidates);
    if (pickedByGrId) return pickedByGrId;
  }

  // 2) Then match by normalized ISBN/ISBN13 if present
  const isbnValues = [];
  if (goodreadsDoc.isbn) isbnValues.push(normalizeIsbn(goodreadsDoc.isbn));
  if (goodreadsDoc.isbn13 && goodreadsDoc.isbn13 !== goodreadsDoc.isbn) {
    isbnValues.push(normalizeIsbn(goodreadsDoc.isbn13));
  }

  const normalizedIsbnValues = isbnValues.filter(Boolean);

  if (normalizedIsbnValues.length > 0) {
    const isbnCandidates = [];

    for (const p of primaries) {
      if (!isNotSelf(p)) continue;

      const pIsbnNorm = normalizeIsbn(p.isbn);
      const pIsbn13Norm = normalizeIsbn(p.isbn13);

      if (
        (pIsbnNorm && normalizedIsbnValues.includes(pIsbnNorm)) ||
        (pIsbn13Norm && normalizedIsbnValues.includes(pIsbn13Norm))
      ) {
        isbnCandidates.push(p);
      }
    }

    const pickedByIsbn = pickBestPrimaryCandidate(isbnCandidates);
    if (pickedByIsbn) return pickedByIsbn;
  }

  // 3) Finally, fall back to normalized title + primary author match
  const titleNorm = normalizeTextForMatch(goodreadsDoc.title);
  const authorNorm = normalizeTextForMatch(
    getPrimaryAuthorName(goodreadsDoc.authors || [])
  );

  if (titleNorm && authorNorm) {
    // 3a) Exact normalized title + author match
    const exactCandidates = primaries.filter((p) => {
      if (!isNotSelf(p)) return false;
      const pTitleNorm = normalizeTextForMatch(p.title);
      const pAuthorNorm = normalizeTextForMatch(
        getPrimaryAuthorName(p.authors || [])
      );
      return pTitleNorm === titleNorm && pAuthorNorm === authorNorm;
    });

    const pickedExact = pickBestPrimaryCandidate(exactCandidates);
    if (pickedExact) return pickedExact;

    // 3b) Omnibus pattern, e.g. Goodreads: "1984" vs primary: "1984 and Animal Farm"
    const titleTokens = titleNorm.split(" ").filter(Boolean);

    if (titleTokens.length > 0) {
      const omnibusCandidates = primaries.filter((p) => {
        if (!isNotSelf(p)) return false;

        const pTitleNorm = normalizeTextForMatch(p.title);
        const pAuthorNorm = normalizeTextForMatch(
          getPrimaryAuthorName(p.authors || [])
        );
        if (!pTitleNorm || !pAuthorNorm) return false;
        if (pAuthorNorm !== authorNorm) return false;

        const pTokens = pTitleNorm.split(" ").filter(Boolean);
        if (pTokens.length <= titleTokens.length) return false;

        const shortSet = new Set(titleTokens);
        const longSet = new Set(pTokens);

        // All Goodreads title tokens must appear in the primary title
        for (const tok of shortSet) {
          if (!longSet.has(tok)) return false;
        }

        // Require an explicit conjunction to avoid "Dune" vs "Dune Messiah"
        if (!longSet.has("and")) return false;

        return true;
      });

      const pickedOmnibus = pickBestPrimaryCandidate(omnibusCandidates);
      if (pickedOmnibus) return pickedOmnibus;
    }
  }

  return null;
}

router.post(
  "/goodreads",
  authenticateToken,
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file || !req.file.buffer) {
        return res.status(400).json({
          success: false,
          error: {
            message:
              "No file uploaded. Please select your Goodreads library CSV export.",
          },
        });
      }

      const csvText = req.file.buffer.toString("utf-8");
      if (!csvText.trim()) {
        return res.status(400).json({
          success: false,
          error: { message: "Uploaded file is empty." },
        });
      }

      let records;
      try {
        records = parseCsv(csvText, {
          columns: true,
          skip_empty_lines: true,
          relax_column_count: true,
          trim: true,
        });
      } catch (parseErr) {
        console.error("Failed to parse Goodreads CSV", parseErr);
        return res.status(400).json({
          success: false,
          error: {
            message:
              "Failed to parse Goodreads CSV. Please ensure you uploaded the original export.",
          },
        });
      }

      if (!Array.isArray(records) || records.length === 0) {
        return res.json({
          success: true,
          data: {
            totalRows: 0,
            matched: 0,
            updated: 0,
            skippedNoMatch: 0,
            skippedNoData: 0,
          },
        });
      }

      const stats = {
        totalRows: records.length,
        matched: 0,
        updated: 0,
        created: 0,
        skippedNoMatch: 0,
        skippedNoData: 0,
      };

      for (const row of records) {
        const ratingRaw = (row["My Rating"] ?? "").toString().trim();
        const dateReadRaw = (row["Date Read"] ?? "").toString().trim();
        const dateAddedRaw = (row["Date Added"] ?? "").toString().trim();
        const exclusiveShelfRaw = (row["Exclusive Shelf"] ?? "").toString().trim();
        const reviewRaw = (row["My Review"] ?? "").toString().trim();
        const readCountRaw = (row["Read Count"] ?? "").toString().trim();

        const hasAnyData =
          (ratingRaw && ratingRaw !== "0") ||
          !!dateReadRaw ||
          !!exclusiveShelfRaw ||
          !!reviewRaw ||
          !!readCountRaw;

        if (!hasAnyData) {
          stats.skippedNoData += 1;
          continue;
        }

        const bookIdRaw = (row["Book Id"] ?? "").toString().trim();
        const isbn13Raw =
          (row["ISBN13"] ?? row["ISBN 13"] ?? "").toString().trim();
        const isbn10Raw = (row["ISBN"] ?? "").toString().trim();
        const titleRaw = (row["Title"] ?? "").toString().trim();
        const authorRaw = (row["Author"] ?? "").toString().trim();

        const isbn13 = normalizeIsbn(isbn13Raw);
        const isbn10 = normalizeIsbn(isbn10Raw);

        let book = null;

        if (isbn13) {
          book =
            (await Book.findOne({ isbn: isbn13 }).exec()) ||
            (await Book.findOne({ isbn13 }).exec());
        }

        if (!book && isbn10) {
          book =
            (await Book.findOne({ isbn: isbn10 }).exec()) ||
            (await Book.findOne({ isbn13: isbn10 }).exec());
        }

        if (!book && bookIdRaw) {
          book = await Book.findOne({ goodreadsId: bookIdRaw }).exec();
        }

        if (!book && titleRaw && authorRaw) {
          const titleRegex = new RegExp("^" + escapeRegex(titleRaw) + "$", "i");
          const primaryAuthor = authorRaw.split(",")[0].trim();
          const authorRegex = new RegExp(escapeRegex(primaryAuthor), "i");

          book = await Book.findOne({
            title: titleRegex,
            authors: authorRegex,
          }).exec();
        }

        const ratingNum = Number(ratingRaw);
        const finishedDate = parseGoodreadsDate(dateReadRaw);
        const addedDate = parseGoodreadsDate(dateAddedRaw);
        const mappedShelf = mapGoodreadsShelf(exclusiveShelfRaw);

        if (!book) {
          // Create a new, unowned book based on Goodreads data
          if (!titleRaw) {
            stats.skippedNoMatch += 1;
            continue;
          }

          const authors = authorRaw ? [authorRaw] : [];
          const publisherRaw = (row["Publisher"] ?? "").toString().trim();
          const pagesRaw = (row["Number of Pages"] ?? "").toString().trim();
          const pageCountNum = Number(pagesRaw);

          const newDoc = {
            title: titleRaw,
            authors,
            isbn: isbn13 || isbn10 || undefined,
            isbn13: isbn13 || undefined,
            goodreadsId: bookIdRaw || undefined,
            publisher: publisherRaw || undefined,
            pageCount:
              !Number.isNaN(pageCountNum) && pageCountNum > 0 ? pageCountNum : undefined,
            rating:
              !Number.isNaN(ratingNum) && ratingNum > 0 && ratingNum <= 5
                ? ratingNum
                : undefined,
            review: reviewRaw || undefined,
            dateAdded: addedDate || undefined,
            dateFinished: finishedDate || undefined,
            readCount:
              readCountRaw && !Number.isNaN(Number(readCountRaw)) && Number(readCountRaw) > 0
                ? Number(readCountRaw)
                : undefined,
            shelf: mappedShelf || undefined,
            owned: false,
            files: [],
            source: "goodreads-import",
          };

          await Book.create(newDoc);
          stats.created += 1;
          continue;
        }

        stats.matched += 1;

        const update = {};

        if (!Number.isNaN(ratingNum) && ratingNum > 0 && ratingNum <= 5) {
          update.rating = ratingNum;
        }

        if (finishedDate) {
          update.dateFinished = finishedDate;
        }

        if (addedDate) {
          update.dateAdded = addedDate;
        }

        if (readCountRaw) {
          const rc = Number(readCountRaw);
          if (!Number.isNaN(rc) && rc > 0) {
            update.readCount = rc;
          }
        }

        if (reviewRaw) {
          update.review = reviewRaw;
        }

        if (mappedShelf) {
          update.shelf = mappedShelf;
        }

        if (bookIdRaw && !book.goodreadsId) {
          update.goodreadsId = bookIdRaw;
        }

        if (Object.keys(update).length === 0) {
          continue;
        }

        await Book.updateOne({ _id: book._id }, { $set: update }).exec();
        stats.updated += 1;
      }

      return res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      console.error("Goodreads import failed", error);
      return res.status(500).json({
        success: false,
        error: {
          message: "Goodreads import failed",
          details: error.message,
        },
      });
    }
  }
);

router.post(
  "/goodreads/dedupe",
  authenticateToken,
  async (req, res) => {
    try {
      const candidates = await Book.find({
        source: "goodreads-import",
        owned: { $ne: true },
      }).lean();

      const primaries = await Book.find({
        source: { $ne: "goodreads-import" },
      }).lean();

      const stats = {
        candidates: candidates.length,
        merged: 0,
        deleted: 0,
        updatedPrimary: 0,
        skippedNoPrimary: 0,
      };

      for (const gr of candidates) {
        const primary = findPrimaryForGoodreads(gr, primaries);
        if (!primary) {
          stats.skippedNoPrimary += 1;
          continue;
        }

        const update = {};

        if (
          (primary.rating === null || primary.rating === undefined) &&
          typeof gr.rating === "number"
        ) {
          update.rating = gr.rating;
        }

        if (!primary.review && gr.review) {
          update.review = gr.review;
        }

        if (!primary.dateFinished && gr.dateFinished) {
          update.dateFinished = gr.dateFinished;
        }

        if (!primary.dateAdded && gr.dateAdded) {
          update.dateAdded = gr.dateAdded;
        }

        if (
          (primary.readCount === null || primary.readCount === undefined) &&
          typeof gr.readCount === "number" &&
          gr.readCount > 0
        ) {
          update.readCount = gr.readCount;
        }

        if (!primary.shelf && gr.shelf) {
          update.shelf = gr.shelf;
        }

        if (!primary.goodreadsId && gr.goodreadsId) {
          update.goodreadsId = gr.goodreadsId;
        }

        if (Object.keys(update).length > 0) {
          await Book.updateOne({ _id: primary._id }, { $set: update }).exec();
          stats.updatedPrimary += 1;
        }

        await Book.deleteOne({ _id: gr._id }).exec();
        stats.merged += 1;
        stats.deleted += 1;
      }

      return res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      console.error("Goodreads dedupe failed", error);
      return res.status(500).json({
        success: false,
        error: {
          message: "Goodreads dedupe failed",
          details: error.message,
        },
      });
    }
  }
);

export default router;
