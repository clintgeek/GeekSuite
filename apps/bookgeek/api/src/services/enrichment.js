/**
 * Metadata enrichment helpers for POST /api/books/:id/enrich: description
 * normalisation, OpenLibrary lookups, and the Calibre `ebook-meta` pass.
 */
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { OUTBOUND_TIMEOUT_MS } from "../coverFetch.js";
import { resolveInLibrary } from "../libraryPaths.js";
import { calibreEbookMetaBin, tempPath } from "../config.js";
import { moveFileSafe } from "./coverFiles.js";

const execFileAsync = promisify(execFile);

export function normalizeIsbn(value) {
  if (!value) return null;
  const digits = String(value).replace(/[^0-9Xx]/g, "");
  return digits || null;
}

export function extractOpenLibraryDescription(desc) {
  if (!desc) return null;
  if (typeof desc === "string") return desc;
  if (typeof desc === "object" && typeof desc.value === "string") {
    return desc.value;
  }
  return null;
}

export function decodeBasicHtmlEntities(input) {
  if (typeof input !== "string") return "";
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

export function normalizeDescription(raw) {
  if (typeof raw !== "string") return null;
  let text = raw.replace(/\u0000/g, "");
  const looksHtml = /<\s*\/?\s*[a-z][^>]*>/i.test(text);
  if (looksHtml) {
    text = text
      .replace(/<\s*br\s*\/?\s*>/gi, "\n")
      .replace(/<\s*\/\s*p\s*>/gi, "\n\n")
      .replace(/<\s*p\b[^>]*>/gi, "")
      .replace(/<\s*\/\s*li\s*>/gi, "\n")
      .replace(/<\s*li\b[^>]*>/gi, "- ")
      .replace(/<[^>]+>/g, "");
  }
  text = decodeBasicHtmlEntities(text);
  text = text.replace(/\r\n?/g, "\n");
  text = text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n");
  text = text.replace(/\n{3,}/g, "\n\n").trim();
  if (!text) return null;
  const maxLen = 12000;
  if (text.length > maxLen) {
    text = text.slice(0, maxLen).trim();
  }
  return text || null;
}

export function descriptionScore(desc) {
  const normalized = normalizeDescription(desc);
  if (!normalized) return 0;
  const lower = normalized.toLowerCase();
  if (
    lower === "n/a" ||
    lower === "na" ||
    lower === "none" ||
    lower === "unknown" ||
    /^no\s+description/.test(lower) ||
    /^description\s+not\s+available/.test(lower)
  ) {
    return 1;
  }
  return Math.min(normalized.length, 2000);
}

export function shouldReplaceDescription(existingDesc, candidateDesc) {
  const candidateNorm = normalizeDescription(candidateDesc);
  if (!candidateNorm) return false;
  const existingScore = descriptionScore(existingDesc);
  const candidateScore = descriptionScore(candidateNorm);
  if (existingScore === 0) return candidateScore > 0;
  if (existingScore <= 80 && candidateScore > existingScore + 60) return true;
  return false;
}

export async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OUTBOUND_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    if (res.status === 404) {
      return null;
    }
    throw new Error(`Request failed with status ${ res.status }`);
  }
  const json = await res.json().catch(() => null);
  if (!json || typeof json !== "object") {
    return null;
  }
  return json;
}

export async function fetchOpenLibraryByIsbn(isbn) {
  const trimmed = String(isbn || "").trim();
  if (!trimmed) return null;
  const url = `https://openlibrary.org/isbn/${ encodeURIComponent(
    trimmed
  ) }.json`;
  const edition = await fetchJson(url);
  if (!edition) return null;

  let work = null;
  try {
    if (Array.isArray(edition.works) && edition.works.length > 0) {
      const w = edition.works[0];
      const workKey =
        typeof w === "string"
          ? w
          : w && typeof w.key === "string"
            ? w.key
            : null;
      if (workKey) {
        const workUrl = workKey.startsWith("http")
          ? `${ workKey }.json`
          : `https://openlibrary.org${ workKey }.json`;
        work = await fetchJson(workUrl);
      }
    }
  } catch {
    // If work lookup fails, we still return edition-level data
    work = null;
  }

  const languageFromEdition = extractOpenLibraryLanguage(edition.languages);
  const languageFromWork = extractOpenLibraryLanguage(work?.languages);

  const result = {
    ...edition,
    description:
      edition.description != null ? edition.description : work?.description,
    publishers: edition.publishers || work?.publishers,
    publish_date: edition.publish_date || work?.first_publish_date,
    number_of_pages: edition.number_of_pages || work?.number_of_pages,
    subjects: edition.subjects || work?.subjects,
    covers: edition.covers || work?.covers,
    language: languageFromEdition || languageFromWork,
  };

  return result;
}

export async function fetchOpenLibraryByTitleAuthor(title, author) {
  const params = new URLSearchParams();
  if (title) params.set("title", title);
  if (author) params.set("author", author);
  params.set("limit", "1");
  const url = `https://openlibrary.org/search.json?${ params.toString() }`;
  const search = await fetchJson(url);
  if (!search || !Array.isArray(search.docs) || search.docs.length === 0) {
    return null;
  }
  const doc = search.docs[0];
  let work = null;
  try {
    const workKey =
      typeof doc.key === "string" && doc.key.startsWith("/works/")
        ? doc.key
        : null;
    if (workKey) {
      const workUrl = `https://openlibrary.org${ workKey }.json`;
      work = await fetchJson(workUrl);
    }
  } catch {
    work = null;
  }

  const languageFromSearch =
    Array.isArray(doc.language) && doc.language.length > 0
      ? doc.language[0]
      : null;
  const languageFromWork = extractOpenLibraryLanguage(work?.languages);

  const result = {
    title: doc.title,
    description: work?.description || null,
    publishers: doc.publisher || work?.publishers,
    publish_date:
      (work && work.first_publish_date) ||
      (doc.first_publish_year ? String(doc.first_publish_year) : undefined),
    number_of_pages: work?.number_of_pages || doc.number_of_pages_median,
    subjects: work?.subjects || doc.subject,
    covers: work?.covers || (doc.cover_i ? [doc.cover_i] : undefined),
    language: languageFromSearch || languageFromWork || undefined,
  };
  return result;
}

export function extractOpenLibraryLanguage(languages) {
  if (!languages) return null;
  if (typeof languages === "string") return languages;
  if (!Array.isArray(languages) || languages.length === 0) return null;
  const first = languages[0];
  if (typeof first === "string") return first;
  if (first && typeof first.key === "string") {
    const parts = first.key.split("/");
    const code = parts[parts.length - 1];
    return code || null;
  }
  return null;
}

export async function getCalibreFileMetadata(filePath) {
  if (!filePath) return null;
  try {
    const { stdout } = await execFileAsync(calibreEbookMetaBin(), [filePath], {
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

export function parseEbookMetaOutput(text) {
  if (!text) return null;
  const lines = String(text).split(/\r?\n/);
  const meta = {};
  let lastKey = null;

  for (const rawLine of lines) {
    if (!rawLine) continue;
    const match = rawLine.match(/^\s*([^:]+?)\s*:\s*(.*)$/);
    if (match) {
      const key = match[1].trim().toLowerCase();
      const value = (match[2] || "").trim();
      lastKey = key;

      if (!value) {
        continue;
      }

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
      } else if (key === "comments") {
        meta.description = value;
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
      continue;
    }

    if (lastKey === "comments" && typeof meta.description === "string") {
      const continuation = String(rawLine).trim();
      if (continuation) {
        meta.description = `${ meta.description }\n${ continuation }`;
      }
    }
  }

  return meta;
}

export function chooseBestCalibreFile(book) {
  if (!book || !Array.isArray(book.files) || book.files.length === 0) {
    return null;
  }
  const files = book.files;
  const priorities = ["epub", "azw3", "mobi", "pdf"];
  for (const fmt of priorities) {
    const found = files.find((f) => {
      const fmtVal = String(f.format || "").toLowerCase();
      if (fmtVal === fmt) return true;
      const ext = path.extname(f.path || "").slice(1).toLowerCase();
      return ext === fmt;
    });
    if (found) return found;
  }
  return files[0];
}

export async function extractCalibreCoverIfMissing(book, fullPath, update, updatedFields) {
  if (!book || !fullPath) return false;
  if (book.coverPath && typeof book.coverPath === "string") {
    return false;
  }
  const tmpDir = tempPath() || "/data/temp";
  const tmpName = `calibre-cover-${ String(book._id) }-${ Date.now() }.jpg`;
  const tmpPath = path.join(tmpDir, tmpName);
  try {
    await fs.promises.mkdir(tmpDir, { recursive: true });
  } catch { }
  try {
    await execFileAsync(calibreEbookMetaBin(), [fullPath, "--get-cover", tmpPath], {
      maxBuffer: 1024 * 1024,
      timeout: 15000,
    });
  } catch (err) {
    if (err && err.code === "ENOENT") {
      console.warn("Calibre ebook-meta not available for cover extraction", {
        error: err.message,
      });
    } else {
      console.warn("Calibre ebook-meta cover extraction failed", {
        error: err.message,
      });
    }
    return false;
  }
  try {
    const stats = await fs.promises.stat(tmpPath);
    if (!stats.isFile() || stats.size === 0) {
      await fs.promises.unlink(tmpPath).catch(() => { });
      return false;
    }
    const libraryRoot = process.env.LIBRARY_PATH || "/data/library";
    const coversDir = path.join(libraryRoot, "covers");
    await fs.promises.mkdir(coversDir, { recursive: true });
    const finalName = `${ String(book._id) }-calibre-${ Date.now() }.jpg`;
    const finalPath = path.join(coversDir, finalName);
    await moveFileSafe(tmpPath, finalPath);
    const relPath = path.relative(libraryRoot, finalPath);
    update.coverPath = relPath;
    updatedFields.push("coverPath");
    return true;
  } catch (err) {
    console.warn("Failed to persist Calibre-extracted cover", {
      error: err.message,
    });
    await fs.promises.unlink(tmpPath).catch(() => { });
    return false;
  }
}

export async function tryCalibreEnrich(book, update, updatedFields, sourceParts) {
  try {
    const bestFile = chooseBestCalibreFile(book);
    if (!bestFile || !bestFile.path) {
      return;
    }
    const fullPath = resolveInLibrary(bestFile.path);
    if (!fullPath) return;
    let stats;
    try {
      stats = await fs.promises.stat(fullPath);
      if (!stats.isFile()) {
        return;
      }
    } catch {
      return;
    }

    let changed = false;

    const meta = await getCalibreFileMetadata(fullPath);
    if (meta) {
      if (!book.title && meta.title) {
        update.title = meta.title;
        updatedFields.push("title");
        changed = true;
      }
      if (
        (!Array.isArray(book.authors) || book.authors.length === 0) &&
        Array.isArray(meta.authors) &&
        meta.authors.length > 0
      ) {
        update.authors = meta.authors;
        updatedFields.push("authors");
        changed = true;
      }
      if (!book.publisher && meta.publisher) {
        update.publisher = meta.publisher;
        updatedFields.push("publisher");
        changed = true;
      }
      if (!book.language && meta.language) {
        update.language = meta.language;
        updatedFields.push("language");
        changed = true;
      }
      if (!book.publishedDate && meta.published) {
        const d = new Date(meta.published);
        if (!Number.isNaN(d.getTime())) {
          update.publishedDate = d;
          updatedFields.push("publishedDate");
          changed = true;
        }
      }
      if (Array.isArray(meta.tags) && meta.tags.length > 0) {
        const existingTags = Array.isArray(book.tags) ? book.tags : [];
        const merged = Array.from(new Set([...existingTags, ...meta.tags]));
        if (merged.length !== existingTags.length) {
          update.tags = merged;
          updatedFields.push("tags");
          changed = true;
        }
      }
      if (!book.isbn && meta.isbn) {
        update.isbn = meta.isbn;
        updatedFields.push("isbn");
        changed = true;
      }
      if (!book.isbn13 && meta.isbn13) {
        update.isbn13 = meta.isbn13;
        updatedFields.push("isbn13");
        changed = true;
      }

      const candidateDescription = normalizeDescription(meta.description);
      if (
        candidateDescription &&
        !update.description &&
        shouldReplaceDescription(book.description, candidateDescription)
      ) {
        update.description = candidateDescription;
        updatedFields.push("description");
        changed = true;
      }
    }

    const coverChanged = await extractCalibreCoverIfMissing(
      book,
      fullPath,
      update,
      updatedFields
    );
    if (coverChanged) {
      changed = true;
    }

    if (changed) {
      sourceParts.push("calibre-file");
    }
  } catch (err) {
    console.warn("Calibre enrichment failed", {
      error: err.message,
    });
  }
}
