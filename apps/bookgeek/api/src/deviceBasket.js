import express from "express";
import mongoose from "mongoose";
import { Book } from "./models/book.js";
import { DeviceBasket } from "./models/deviceBasket.js";
import { Profile } from "./models/profile.js";
import { generateSlug, normalizeSlug } from "./slug.js";
import { ensureFormat, EnsureFormatError } from "./ebookFormats.js";
import { authenticateToken } from "./middleware/auth.js";

// Basket lifetime. Defaults to 30 minutes per D1 in the plan; overridable via
// env for local device testing (e.g. a 2-minute expiry).
const DEVICE_BASKET_TTL_MINUTES = (() => {
  const raw = Number(process.env.DEVICE_BASKET_TTL_MINUTES);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return 30;
})();
const BASKET_TTL_MS = DEVICE_BASKET_TTL_MINUTES * 60 * 1000;

// Device → preferred format map. Unknown device is a 400 with this list.
const DEVICE_FORMAT_MAP = {
  kindle: "mobi",
};

const MAX_BOOKS_PER_BASKET = 50;
const SLUG_RETRY_LIMIT = 3;

// Personal "secret word": 3–24 chars, starts with a letter, then letters,
// digits or hyphens. Lowercase-normalized before matching.
const DEVICE_WORD_PATTERN = /^[a-z][a-z0-9-]{2,23}$/;

// Rate limit for the public word→basket lookup (single-word guessing guard).
const WORD_ATTEMPT_LIMIT = 10;
const WORD_ATTEMPT_WINDOW_MS = 60 * 1000;

const router = express.Router();

/** Truncate slug for log lines — first word plus ellipsis. */
function truncSlug(slug) {
  if (!slug) return "";
  const first = String(slug).split("-")[0] || "";
  return `${first}…`;
}

/** Minimal HTML escape for text interpolated into the primitive Kindle page. */
function escapeHtml(input) {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Trim + lowercase a submitted secret word. Never throws. */
function normalizeDeviceWord(input) {
  return String(input ?? "").trim().toLowerCase();
}

/** True when the (normalized) word is an acceptable secret word. */
function isValidDeviceWord(input) {
  return DEVICE_WORD_PATTERN.test(normalizeDeviceWord(input));
}

// In-memory fixed-window rate limiter for POST /download-basket only.
// Single process, best effort — no dependency, resets on restart.
const wordAttempts = new Map();

/** Returns true when this key is allowed another attempt. */
function checkWordRateLimit(key, now = Date.now()) {
  const id = String(key || "unknown");
  const entry = wordAttempts.get(id);
  if (!entry || now - entry.windowStart >= WORD_ATTEMPT_WINDOW_MS) {
    wordAttempts.set(id, { windowStart: now, count: 1 });
    if (wordAttempts.size > 1000) {
      for (const [k, v] of wordAttempts) {
        if (now - v.windowStart >= WORD_ATTEMPT_WINDOW_MS) wordAttempts.delete(k);
      }
    }
    return true;
  }
  entry.count += 1;
  return entry.count <= WORD_ATTEMPT_LIMIT;
}

/** Public URL base for basket links. Falls back to the request. */
function publicBaseUrl(req) {
  const configured =
    process.env.BOOKGEEK_PUBLIC_URL ||
    process.env.PUBLIC_BASE_URL ||
    process.env.PUBLIC_URL ||
    "";
  const trimmed = String(configured).trim().replace(/\/+$/, "");
  if (trimmed) return trimmed;
  const host = req.get("host");
  const proto = req.protocol;
  return `${proto}://${host}`;
}

/** No-store + noindex headers for every public basket route. */
function noStoreNoIndex(req, res, next) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  next();
}

/** Minutes remaining, rounded up so "0 minutes" only appears at true expiry. */
function minutesRemaining(expiresAt, now = Date.now()) {
  const ms = new Date(expiresAt).getTime() - now;
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.max(1, Math.ceil(ms / 60000));
}

/**
 * Primitive HTML 4-era page. No JS, no external CSS. Works on an ancient
 * Kindle browser. All interpolated user data must already be escaped.
 */
function renderBasketPage({ slug, items }) {
  const minutes = DEVICE_BASKET_TTL_MINUTES;
  const rows = items
    .map((it, i) => {
      if (!it.available) {
        return `<li>${it.titleHtml} <i>(unavailable)</i></li>`;
      }
      const meta = it.authorHtml
        ? `${it.titleHtml} — ${it.authorHtml}`
        : it.titleHtml;
      const href = `/download-basket/${encodeURIComponent(slug)}/item/${i}`;
      return `<li>${meta} &nbsp; <a href="${href}">[ Download ]</a></li>`;
    })
    .join("\n");

  return (
    "<!DOCTYPE HTML PUBLIC \"-//W3C//DTD HTML 4.01//EN\">\n" +
    "<html><head><title>BookGeek Basket</title>" +
    "<meta name=\"robots\" content=\"noindex,nofollow\">" +
    "</head><body>" +
    "<h1>BOOKGEEK</h1>" +
    "<h2>Your Books</h2>" +
    `<ul>\n${rows}\n</ul>` +
    `<p>This basket expires after ${minutes} minute${minutes === 1 ? "" : "s"} of inactivity.</p>` +
    "</body></html>"
  );
}

/**
 * Primitive landing page: the stable URL a device bookmarks once. Asks for the
 * user's secret word and posts it back here. Optional neutral message.
 */
function renderWordPromptPage(message = "") {
  const note = message ? `<p>${escapeHtml(message)}</p>` : "";
  return (
    "<!DOCTYPE HTML PUBLIC \"-//W3C//DTD HTML 4.01//EN\">\n" +
    "<html><head><title>BookGeek</title>" +
    "<meta name=\"robots\" content=\"noindex,nofollow\">" +
    "</head><body>" +
    "<h1>BOOKGEEK</h1>" +
    "<p>Enter your secret word</p>" +
    note +
    "<form method=\"post\" action=\"/download-basket\">" +
    "<input type=\"text\" name=\"word\">" +
    "<input type=\"submit\" value=\"Go\">" +
    "</form>" +
    "</body></html>"
  );
}

/** Primitive expired/not-found page. */
function renderExpiredPage() {
  return (
    "<!DOCTYPE HTML PUBLIC \"-//W3C//DTD HTML 4.01//EN\">\n" +
    "<html><head><title>BookGeek</title>" +
    "<meta name=\"robots\" content=\"noindex,nofollow\">" +
    "</head><body>" +
    "<h1>BOOKGEEK</h1>" +
    "<p>This BookGeek basket has expired.</p>" +
    "</body></html>"
  );
}

/** Primitive plain error page. */
function renderErrorPage(message) {
  return (
    "<!DOCTYPE HTML PUBLIC \"-//W3C//DTD HTML 4.01//EN\">\n" +
    "<html><head><title>BookGeek</title>" +
    "<meta name=\"robots\" content=\"noindex,nofollow\">" +
    "</head><body>" +
    "<h1>BOOKGEEK</h1>" +
    `<p>${escapeHtml(message)}</p>` +
    "</body></html>"
  );
}

function isDbReady() {
  return mongoose.connection.readyState === 1;
}

/**
 * POST /api/device-baskets — create a basket.
 * Authenticated. Body: { device?: string = "kindle", bookIds: string[] (1..50) }
 * Responds { slug, url, expiresAt }.
 */
router.post("/api/device-baskets", authenticateToken, async (req, res) => {
  try {
    if (!isDbReady()) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "User not available from token" });
    }

    const device = String(req.body?.device || "kindle").toLowerCase();
    const format = DEVICE_FORMAT_MAP[device];
    if (!format) {
      const supported = Object.keys(DEVICE_FORMAT_MAP).join(", ");
      return res.status(400).json({
        error: `Unsupported device. Supported devices: ${supported}`,
      });
    }

    const rawIds = Array.isArray(req.body?.bookIds) ? req.body.bookIds : null;
    if (!rawIds || rawIds.length === 0) {
      return res.status(400).json({ error: "bookIds is required" });
    }
    if (rawIds.length > MAX_BOOKS_PER_BASKET) {
      return res
        .status(400)
        .json({ error: `bookIds may contain at most ${MAX_BOOKS_PER_BASKET} entries` });
    }

    const bookIds = [];
    for (const raw of rawIds) {
      if (typeof raw !== "string" || !mongoose.isValidObjectId(raw)) {
        return res.status(400).json({ error: "bookIds contains an invalid id" });
      }
      bookIds.push(raw);
    }

    // Validate every id resolves to an actual Book document.
    const found = await Book.find({ _id: { $in: bookIds } }, { _id: 1 }).lean();
    if (found.length !== bookIds.length) {
      const foundSet = new Set(found.map((b) => String(b._id)));
      const missing = bookIds.filter((id) => !foundSet.has(id));
      return res.status(400).json({
        error: "One or more bookIds do not exist",
        missing,
      });
    }

    const items = bookIds.map((bookId) => ({ bookId, format }));
    const expiresAt = new Date(Date.now() + BASKET_TTL_MS);

    let created = null;
    let lastErr = null;
    for (let attempt = 0; attempt < SLUG_RETRY_LIMIT; attempt++) {
      const slug = generateSlug();
      try {
        created = await DeviceBasket.create({
          slug,
          userId,
          device,
          items,
          expiresAt,
        });
        break;
      } catch (err) {
        // Duplicate slug — retry. Anything else bubbles out.
        if (err && err.code === 11000) {
          lastErr = err;
          continue;
        }
        throw err;
      }
    }

    if (!created) {
      console.error("device-basket slug generation exhausted retries", {
        err: lastErr?.message,
      });
      return res.status(500).json({ error: "Failed to create basket" });
    }

    const base = publicBaseUrl(req);
    const url = `${base}/download-basket/${created.slug}`;
    const landingUrl = `${base}/download-basket`;
    console.log("device-basket created", {
      slugPrefix: truncSlug(created.slug),
      itemCount: items.length,
      device,
    });

    return res.status(201).json({
      slug: created.slug,
      url,
      landingUrl,
      expiresAt: created.expiresAt,
    });
  } catch (err) {
    console.error("POST /api/device-baskets error", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to create basket" });
    }
  }
});

/**
 * Look up a basket by slug and enforce request-time expiry.
 * Expiry is a sliding inactivity window: any live hit (page view or item
 * download) pushes expiresAt back out to a full TTL from now.
 */
async function loadLiveBasket(rawSlug) {
  const slug = normalizeSlug(rawSlug);
  if (!slug) return { basket: null, expired: false };
  const basket = await DeviceBasket.findOne({ slug });
  if (!basket) return { basket: null, expired: false };
  if (!basket.expiresAt || basket.expiresAt.getTime() <= Date.now()) {
    return { basket: null, expired: true };
  }
  basket.expiresAt = new Date(Date.now() + BASKET_TTL_MS);
  await basket.save();
  return { basket, expired: false };
}

/**
 * GET /download-basket — the stable, bookmarkable landing page. Registered
 * before the /:slug route; Express would not match this path against
 * "/download-basket/:slug" anyway (that pattern requires a second segment),
 * but the order is explicit so it can never regress.
 */
router.get("/download-basket", noStoreNoIndex, (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(renderWordPromptPage());
});

/**
 * POST /download-basket — resolve a secret word to the user's newest active
 * basket. Deliberately neutral on failure: never reveals whether a word exists.
 * Body is urlencoded (parsed app-wide by express.urlencoded in server.js;
 * the router-local parser below keeps this route self-contained).
 */
router.post(
  "/download-basket",
  noStoreNoIndex,
  express.urlencoded({ extended: false }),
  async (req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    try {
      const ip = req.ip || req.socket?.remoteAddress || "unknown";
      if (!checkWordRateLimit(ip)) {
        return res
          .status(429)
          .send(renderErrorPage("Too many attempts. Wait a minute."));
      }

      if (!isDbReady()) {
        return res.status(503).send(renderErrorPage("Database not connected."));
      }

      const noMatch = () =>
        res.status(200).send(renderWordPromptPage("No active basket for that word."));

      const word = normalizeDeviceWord(req.body?.word);
      if (!isValidDeviceWord(word)) return noMatch();

      const profile = await Profile.findOne({ deviceWord: word }, { userId: 1 }).lean();
      if (!profile?.userId) return noMatch();

      const basket = await DeviceBasket.findOne(
        { userId: profile.userId, expiresAt: { $gt: new Date() } },
        { slug: 1 }
      )
        .sort({ createdAt: -1 })
        .lean();
      if (!basket?.slug) return noMatch();

      return res.redirect(302, `/download-basket/${encodeURIComponent(basket.slug)}`);
    } catch (err) {
      console.error("POST /download-basket error", { err: err.message });
      if (!res.headersSent) {
        res.status(500).send(renderErrorPage("Server error."));
      }
    }
  }
);

/**
 * GET /download-basket/:slug — public HTML page.
 */
router.get("/download-basket/:slug", noStoreNoIndex, async (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  try {
    if (!isDbReady()) {
      return res.status(503).send(renderErrorPage("Database not connected."));
    }

    const { basket, expired } = await loadLiveBasket(req.params.slug);
    if (!basket) {
      const status = expired ? 410 : 404;
      return res.status(status).send(renderExpiredPage());
    }

    const bookIds = basket.items.map((it) => it.bookId);
    const books = await Book.find(
      { _id: { $in: bookIds } },
      { title: 1, authors: 1 }
    ).lean();
    const byId = new Map(books.map((b) => [String(b._id), b]));

    const items = basket.items.map((it) => {
      const book = byId.get(String(it.bookId));
      if (!book) {
        return {
          available: false,
          titleHtml: escapeHtml("(book no longer available)"),
          authorHtml: "",
        };
      }
      const author = Array.isArray(book.authors) ? book.authors[0] : "";
      return {
        available: true,
        titleHtml: escapeHtml(book.title || "(untitled)"),
        authorHtml: author ? escapeHtml(author) : "",
      };
    });

    return res.status(200).send(
      renderBasketPage({
        slug: basket.slug,
        items,
      })
    );
  } catch (err) {
    console.error("GET /download-basket/:slug error", {
      slugPrefix: truncSlug(req.params.slug),
      err: err.message,
    });
    if (!res.headersSent) {
      res.status(500).send(renderErrorPage("Server error."));
    }
  }
});

/**
 * GET /download-basket/:slug/item/:index — public file download.
 */
router.get(
  "/download-basket/:slug/item/:index",
  noStoreNoIndex,
  async (req, res) => {
    try {
      if (!isDbReady()) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.status(503).send(renderErrorPage("Database not connected."));
      }

      const { basket, expired } = await loadLiveBasket(req.params.slug);
      if (!basket) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        const status = expired ? 410 : 404;
        return res.status(status).send(renderExpiredPage());
      }

      const index = Number.parseInt(req.params.index, 10);
      if (!Number.isInteger(index) || index < 0 || index >= basket.items.length) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.status(404).send(renderErrorPage("Item not found."));
      }

      const item = basket.items[index];
      let book = null;
      if (mongoose.isValidObjectId(item.bookId)) {
        book = await Book.findById(item.bookId);
      }
      if (!book) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.status(404).send(renderErrorPage("Book not found."));
      }

      let ensured;
      try {
        ensured = await ensureFormat(book, item.format, {
          logTag: "/download-basket/item",
        });
      } catch (err) {
        if (err instanceof EnsureFormatError) {
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          return res.status(err.status).send(renderErrorPage(err.message));
        }
        throw err;
      }

      return res.download(ensured.fullPath, ensured.filename, (err) => {
        if (err) {
          console.error("/download-basket/item send error", {
            slugPrefix: truncSlug(basket.slug),
            err: err.message,
          });
          if (!res.headersSent) {
            res.status(500).end();
          }
        }
      });
    } catch (err) {
      console.error("GET /download-basket/:slug/item/:index error", {
        slugPrefix: truncSlug(req.params.slug),
        err: err.message,
      });
      if (!res.headersSent) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.status(500).send(renderErrorPage("Server error."));
      }
    }
  }
);

export default router;
export {
  BASKET_TTL_MS,
  DEVICE_BASKET_TTL_MINUTES,
  DEVICE_FORMAT_MAP,
  DEVICE_WORD_PATTERN,
  WORD_ATTEMPT_LIMIT,
  WORD_ATTEMPT_WINDOW_MS,
  checkWordRateLimit,
  escapeHtml,
  isValidDeviceWord,
  minutesRemaining,
  normalizeDeviceWord,
};
