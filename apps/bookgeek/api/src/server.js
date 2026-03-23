import express from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "path";
import fs from "fs";
import multer from "multer";
import crypto from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from "url";
import { Book } from "./models/book.js";
import { Profile } from "./models/profile.js";
import authRouter from "./routes/authRoutes.js";
import aiRouter from "./routes/aiRoutes.js";
import importRouter from "./routes/importRoutes.js";
import { authenticateToken } from "./middleware/auth.js";
import { meHandler } from "@geeksuite/user/server";
import { sendMail } from "./services/emailService.js";

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicPath = path.join(__dirname, "../public");

function isAllowedCorsOrigin(origin) {
  if (!origin) return true;

  const allowList = new Set([
    "http://localhost:1800",
    "http://127.0.0.1:1800",
    "http://localhost:1801",
    "http://127.0.0.1:1801",
  ]);

  if (allowList.has(origin)) return true;

  try {
    const url = new URL(origin);
    if (url.hostname === "clintgeek.com" || url.hostname.endsWith(".clintgeek.com")) {
      return true;
    }
  } catch {
    // ignore
  }

  return false;
}

app.use(
  cors({
    origin(origin, cb) {
      if (isAllowedCorsOrigin(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(morgan("dev"));
app.use("/api/auth", authRouter);
app.use("/api/ai", aiRouter);
app.use("/api/import", importRouter);

const API_PORT = process.env.API_PORT || 1800;
const MONGODB_URI =
  process.env.BASEGEEK_MONGODB_URI || process.env.MONGODB_URI || "";

const TEMP_PATH = process.env.TEMP_PATH || "/data/temp";

const ADDME_PATH = process.env.ADDME_PATH || "/data/addMe";

const CALIBRE_EBOOK_META_BIN =
  process.env.CALIBRE_EBOOK_META_BIN || "ebook-meta";

const execFileAsync = promisify(execFile);

const uploadToTemp = multer({
  dest: TEMP_PATH,
  limits: {
    fileSize: 200 * 1024 * 1024,
  },
});

const KINDLE_UI_PIN = String(process.env.KINDLE_UI_PIN || "").trim();
const KINDLE_UI_COOKIE_NAME = "bookgeek_kindle";
const KINDLE_UI_COOKIE_SECRET =
  process.env.KINDLE_UI_COOKIE_SECRET || process.env.JWT_SECRET || "";

function parseCookies(req) {
  const header = req.headers?.cookie;
  if (!header || typeof header !== "string") return {};
  const out = {};
  const parts = header.split(";");
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (!key) continue;
    out[key] = decodeURIComponent(val);
  }
  return out;
}

function kindleAuthCookieValue() {
  if (!KINDLE_UI_COOKIE_SECRET) return null;
  return crypto
    .createHmac("sha256", KINDLE_UI_COOKIE_SECRET)
    .update("kindle-ui")
    .digest("hex");
}

function isHttpsRequest(req) {
  const proto = String(req.headers?.["x-forwarded-proto"] || "").toLowerCase();
  if (proto === "https") return true;
  return !!req.secure;
}

function setCookie(res, name, value, opts = {}) {
  const parts = [`${ name }=${ encodeURIComponent(value) }`];
  parts.push(`Path=${ opts.path || "/" }`);
  if (opts.httpOnly !== false) parts.push("HttpOnly");
  if (opts.sameSite) parts.push(`SameSite=${ opts.sameSite }`);
  if (opts.secure) parts.push("Secure");
  if (typeof opts.maxAgeSeconds === "number") {
    parts.push(`Max-Age=${ Math.max(0, Math.floor(opts.maxAgeSeconds)) }`);
  }
  res.setHeader("Set-Cookie", parts.join("; "));
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function kindleLayout(title, bodyHtml) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${ escapeHtml(title) }</title>
  <link rel="stylesheet" href="/kindle/style.css" />
</head>
<body>
  <div class="wrap">
    ${ bodyHtml }
  </div>
</body>
</html>`;
}

function kindleNotConfigured(res) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res
    .status(503)
    .send(
      kindleLayout(
        "Kindle UI",
        `<div class="card"><div class="row"><span class="label">Kindle UI not configured</span></div><div class="row small muted">Set KINDLE_UI_PIN (and optionally KINDLE_UI_TO_EMAIL) in the API environment.</div></div>`
      )
    );
}

function requireKindleAuth(req, res, next) {
  if (!KINDLE_UI_PIN) {
    return kindleNotConfigured(res);
  }
  const expected = kindleAuthCookieValue();
  const cookies = parseCookies(req);
  const actual = cookies[KINDLE_UI_COOKIE_NAME];
  if (expected && actual === expected) {
    return next();
  }
  const nextUrl = req.originalUrl || "/kindle";
  return res.redirect(`/kindle/login?next=${ encodeURIComponent(nextUrl) }`);
}

async function resolveKindleTargetEmail() {
  const envEmail = String(process.env.KINDLE_UI_TO_EMAIL || "").trim();
  if (envEmail) return envEmail;

  const userId = String(process.env.KINDLE_UI_USER_ID || "").trim();
  if (userId) {
    const p = await Profile.findOne({ userId }).lean();
    const email = typeof p?.kindleEmail === "string" ? p.kindleEmail.trim() : "";
    if (email) return email;
  }

  const p = await Profile.findOne({ kindleEmail: { $exists: true, $ne: "" } })
    .sort({ updatedAt: -1 })
    .lean();
  const email = typeof p?.kindleEmail === "string" ? p.kindleEmail.trim() : "";
  return email || null;
}

app.get("/kindle/style.css", (req, res) => {
  res.setHeader("Content-Type", "text/css; charset=utf-8");
  return res.send(`
body { font-family: Arial, Helvetica, sans-serif; font-size: 18px; line-height: 1.4; margin: 0; padding: 0; background: #fff; color: #000; }
a { color: #000; }
.wrap { padding: 12px; }
.topbar { margin-bottom: 10px; }
.topbar a { margin-right: 10px; }
.card { border: 1px solid #000; padding: 10px; margin: 10px 0; }
.small { font-size: 14px; }
.muted { color: #444; }
.row { margin: 6px 0; }
.label { font-weight: bold; }
.booklist { list-style: none; padding: 0; margin: 0; }
.booklist li { padding: 8px 0; border-bottom: 1px solid #ccc; }
.booklist a { text-decoration: none; }
.controls select, .controls input { font-size: 18px; padding: 6px; width: 100%; box-sizing: border-box; margin: 6px 0; }
.controls button { font-size: 18px; padding: 8px 12px; }
.pager a { margin-right: 12px; }
.desc { white-space: pre-wrap; }
img.cover { max-width: 220px; height: auto; border: 1px solid #000; }
  `);
});

app.get("/kindle/login", (req, res) => {
  if (!KINDLE_UI_PIN) {
    return kindleNotConfigured(res);
  }
  const nextUrl = typeof req.query.next === "string" ? req.query.next : "/kindle";
  const err = typeof req.query.err === "string" ? req.query.err : "";
  const html = kindleLayout(
    "BookGeek Kindle Login",
    `
    <div class="topbar">
      <a href="/kindle">BookGeek</a>
    </div>
    <div class="card">
      <div class="row"><span class="label">PIN Login</span></div>
      ${ err ? `<div class="row muted">${ escapeHtml(err) }</div>` : "" }
      <form method="post" action="/kindle/login" class="controls">
        <input type="hidden" name="next" value="${ escapeHtml(nextUrl) }" />
        <input type="password" inputmode="numeric" name="pin" placeholder="8-digit PIN" />
        <button type="submit">Sign in</button>
      </form>
    </div>
  `
  );
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.send(html);
});

app.post("/kindle/login", (req, res) => {
  if (!KINDLE_UI_PIN) {
    return kindleNotConfigured(res);
  }
  const pin = typeof req.body?.pin === "string" ? req.body.pin.trim() : "";
  const nextUrl = typeof req.body?.next === "string" ? req.body.next : "/kindle";
  if (!pin || pin !== KINDLE_UI_PIN) {
    return res.redirect(
      `/kindle/login?err=${ encodeURIComponent("Invalid PIN") }&next=${ encodeURIComponent(
        nextUrl
      ) }`
    );
  }

  const val = kindleAuthCookieValue();
  if (!val) {
    return res.status(500).send("Kindle UI not configured");
  }
  setCookie(res, KINDLE_UI_COOKIE_NAME, val, {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    secure: isHttpsRequest(req),
    maxAgeSeconds: 60 * 60 * 24 * 30,
  });
  return res.redirect(nextUrl || "/kindle");
});

app.get("/kindle/logout", (req, res) => {
  setCookie(res, KINDLE_UI_COOKIE_NAME, "", {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    secure: isHttpsRequest(req),
    maxAgeSeconds: 0,
  });
  return res.redirect("/kindle/login");
});

app.get("/kindle", requireKindleAuth, async (req, res) => {
  try {
    if (!MONGODB_URI || mongoose.connection.readyState !== 1) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(503).send(kindleLayout("BookGeek", "Database not connected"));
    }

    const shelf = typeof req.query.shelf === "string" ? req.query.shelf : "all";
    const owned = typeof req.query.owned === "string" ? req.query.owned : "owned";
    const sort = typeof req.query.sort === "string" ? req.query.sort : "title";
    const dir = String(req.query.dir || "asc").toLowerCase() === "desc" ? -1 : 1;
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = 20;
    const skip = (page - 1) * limit;

    const andConds = [];
    if (shelf && shelf !== "all") {
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
    if (owned === "owned") {
      andConds.push({ owned: true });
    } else if (owned === "unowned") {
      andConds.push({ owned: false });
    }
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

    const sortObj =
      sort === "author"
        ? { "authors.0": dir, title: 1 }
        : { title: dir, "authors.0": 1 };

    const [items, total] = await Promise.all([
      Book.find(filter)
        .select("title authors shelf owned files")
        .sort(sortObj)
        .skip(skip)
        .limit(limit)
        .lean(),
      Book.countDocuments(filter),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));
    const baseParams = new URLSearchParams();
    if (shelf) baseParams.set("shelf", shelf);
    if (owned) baseParams.set("owned", owned);
    if (sort) baseParams.set("sort", sort);
    baseParams.set("dir", dir === -1 ? "desc" : "asc");
    if (q) baseParams.set("q", q);

    const shelves = [
      "all",
      "unread",
      "reading",
      "read",
      "want-to-read",
      "abandoned",
      "need-to-find",
    ];

    const ownedOptions = [
      { id: "owned", label: "Owned" },
      { id: "unowned", label: "Unowned" },
      { id: "all", label: "All" },
    ];

    const shelfOptionsHtml = shelves
      .map((s) => {
        const sel = s === shelf ? " selected" : "";
        return `<option value="${ escapeHtml(s) }"${ sel }>${ escapeHtml(s) }</option>`;
      })
      .join("");

    const ownedOptionsHtml = ownedOptions
      .map((o) => {
        const sel = o.id === owned ? " selected" : "";
        return `<option value="${ escapeHtml(o.id) }"${ sel }>${ escapeHtml(o.label) }</option>`;
      })
      .join("");

    const listItems = items
      .map((b) => {
        const id = b._id?.toString?.() || "";
        const titleText = b.title || "Untitled";
        const authorsText = Array.isArray(b.authors) ? b.authors.join(", ") : "";
        const hasEpub =
          Array.isArray(b.files) &&
          b.files.some((f) => {
            const fmt = String(f?.format || "").toLowerCase();
            if (fmt === "epub") return true;
            const ext = path.extname(f?.path || "").slice(1).toLowerCase();
            return ext === "epub";
          });
        const badge = hasEpub ? "" : " <span class=\"small muted\">(no epub)</span>";
        const back = encodeURIComponent(req.originalUrl || "/kindle");
        return `<li><a href="/kindle/books/${ encodeURIComponent(
          id
        ) }?back=${ back }"><span class="label">${ escapeHtml(
          titleText
        ) }</span></a><div class="small muted">${ escapeHtml(
          authorsText
        ) }${ badge }</div></li>`;
      })
      .join("\n");

    const prevLink =
      page > 1
        ? `/kindle?${ baseParams.toString() }&page=${ page - 1 }`
        : null;
    const nextLink =
      page < totalPages
        ? `/kindle?${ baseParams.toString() }&page=${ page + 1 }`
        : null;

    const html = kindleLayout(
      "BookGeek",
      `
      <div class="topbar">
        <a href="/kindle">BookGeek</a>
        <a href="/kindle/logout" class="small">Logout</a>
      </div>
      <div class="card controls">
        <form method="get" action="/kindle">
          <div class="row">
            <div class="label">Shelf</div>
            <select name="shelf">
              ${ shelfOptionsHtml }
            </select>
          </div>
          <div class="row">
            <div class="label">Owned</div>
            <select name="owned">
              ${ ownedOptionsHtml }
            </select>
          </div>
          <div class="row">
            <div class="label">Sort</div>
            <select name="sort">
              <option value="title"${ sort === "title" ? " selected" : "" }>Title</option>
              <option value="author"${ sort === "author" ? " selected" : "" }>Author</option>
            </select>
            <select name="dir">
              <option value="asc"${ dir === 1 ? " selected" : "" }>A-Z</option>
              <option value="desc"${ dir === -1 ? " selected" : "" }>Z-A</option>
            </select>
          </div>
          <div class="row">
            <div class="label">Search</div>
            <input type="text" name="q" value="${ escapeHtml(q) }" placeholder="Title/Author/Tag" />
          </div>
          <button type="submit">Apply</button>
        </form>
      </div>

      <div class="row small muted">Showing ${ items.length } of ${ total }. Page ${ page } / ${ totalPages }.</div>
      <ul class="booklist">${ listItems || "<li>No books found.</li>" }</ul>
      <div class="row pager">
        ${ prevLink ? `<a href="${ prevLink }">Prev</a>` : "" }
        ${ nextLink ? `<a href="${ nextLink }">Next</a>` : "" }
      </div>
    `
    );

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  } catch (err) {
    console.error("/kindle error", err);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(500).send(kindleLayout("BookGeek", "Error"));
  }
});

app.get("/kindle/books/:id", requireKindleAuth, async (req, res) => {
  try {
    if (!MONGODB_URI || mongoose.connection.readyState !== 1) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(503).send(kindleLayout("Book", "Database not connected"));
    }

    const id = req.params.id;
    const book = await Book.findById(id).lean();
    if (!book) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(404).send(kindleLayout("Book", "Not found"));
    }

    const back = typeof req.query.back === "string" ? req.query.back : "/kindle";
    const showCover = String(req.query.cover || "") === "1";
    const status = typeof req.query.status === "string" ? req.query.status : "";
    const errorMsg = typeof req.query.err === "string" ? req.query.err : "";

    const titleText = book.title || "Untitled";
    const authorsText = Array.isArray(book.authors) ? book.authors.join(", ") : "";
    const tagsText = Array.isArray(book.tags) ? book.tags.join(", ") : "";
    const descText = normalizeDescription(book.description) || "";
    const coverToggleUrl = showCover
      ? `/kindle/books/${ encodeURIComponent(id) }?back=${ encodeURIComponent(back) }`
      : `/kindle/books/${ encodeURIComponent(id) }?back=${ encodeURIComponent(
        back
      ) }&cover=1`;

    const hasEpub =
      Array.isArray(book.files) &&
      book.files.some((f) => {
        const fmt = String(f?.format || "").toLowerCase();
        if (fmt === "epub") return true;
        const ext = path.extname(f?.path || "").slice(1).toLowerCase();
        return ext === "epub";
      });

    const html = kindleLayout(
      titleText,
      `
      <div class="topbar">
        <a href="${ escapeHtml(back) }">← Back</a>
        <a href="/kindle/logout" class="small">Logout</a>
      </div>
      <div class="card">
        <div class="row"><span class="label">${ escapeHtml(titleText) }</span></div>
        <div class="row small muted">${ escapeHtml(authorsText) }</div>
        ${ tagsText ? `<div class="row small"><span class="label">Tags:</span> ${ escapeHtml(tagsText) }</div>` : "" }
        <div class="row small"><span class="label">Owned:</span> ${ book.owned ? "Yes" : "No" }</div>
        <div class="row small"><span class="label">Shelf:</span> ${ escapeHtml(book.shelf || "unread") }</div>

        ${ status ? `<div class="row small">${ escapeHtml(status) }</div>` : "" }
        ${ errorMsg ? `<div class="row small">${ escapeHtml(errorMsg) }</div>` : "" }

        <div class="row">
          <a href="${ coverToggleUrl }" class="small">${ showCover ? "Hide cover" : "Show cover" }</a>
        </div>
        ${ showCover
        ? `<div class="row"><img class="cover" src="/api/books/${ encodeURIComponent(
          id
        ) }/cover" alt="Cover" /></div>`
        : ""
      }

        <div class="row">
          <form method="post" action="/kindle/books/${ encodeURIComponent(id) }/send">
            <input type="hidden" name="back" value="${ escapeHtml(back) }" />
            ${ showCover ? `<input type="hidden" name="cover" value="1" />` : "" }
            <button type="submit" ${ hasEpub ? "" : "disabled" }>Send to Kindle</button>
          </form>
          ${ hasEpub ? "" : `<div class=\"small muted\">No EPUB available for this book.</div>` }
        </div>
      </div>

      <div class="card">
        <div class="row"><span class="label">Description</span></div>
        <div class="desc">${ escapeHtml(descText || "") }</div>
      </div>
    `
    );

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  } catch (err) {
    console.error("/kindle/books/:id error", err);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(500).send(kindleLayout("Book", "Error"));
  }
});

app.post("/kindle/books/:id/send", requireKindleAuth, async (req, res) => {
  try {
    if (!MONGODB_URI || mongoose.connection.readyState !== 1) {
      return res.redirect(
        `/kindle/books/${ encodeURIComponent(
          req.params.id
        ) }?err=${ encodeURIComponent("Database not connected") }`
      );
    }

    const id = req.params.id;
    const back = typeof req.body?.back === "string" ? req.body.back : "/kindle";
    const cover = typeof req.body?.cover === "string" ? req.body.cover : "";
    const coverParam = cover === "1" ? "&cover=1" : "";

    const kindleEmail = await resolveKindleTargetEmail();
    if (!kindleEmail) {
      return res.redirect(
        `/kindle/books/${ encodeURIComponent(
          id
        ) }?back=${ encodeURIComponent(back) }${ coverParam }&err=${ encodeURIComponent(
          "Kindle email not configured"
        ) }`
      );
    }

    const book = await Book.findById(id).lean();
    if (!book) {
      return res.redirect(`/kindle?err=${ encodeURIComponent("Book not found") }`);
    }

    let epubFile = null;
    if (Array.isArray(book.files)) {
      epubFile =
        book.files.find((f) => String(f.format || "").toLowerCase() === "epub") ||
        book.files.find((f) => {
          const ext = path.extname(f.path || "").slice(1).toLowerCase();
          return ext === "epub";
        });
    }

    if (!epubFile) {
      return res.redirect(
        `/kindle/books/${ encodeURIComponent(
          id
        ) }?back=${ encodeURIComponent(back) }${ coverParam }&err=${ encodeURIComponent(
          "No EPUB format available"
        ) }`
      );
    }

    const libraryRoot = process.env.LIBRARY_PATH || "/data/library";
    const fullPath = path.join(libraryRoot, epubFile.path);

    const kindleEnabled =
      String(process.env.KINDLE_ENABLED || "").toLowerCase() === "true";
    if (!kindleEnabled) {
      return res.redirect(
        `/kindle/books/${ encodeURIComponent(
          id
        ) }?back=${ encodeURIComponent(back) }${ coverParam }&status=${ encodeURIComponent(
          "KINDLE_ENABLED is not true"
        ) }`
      );
    }

    const subject =
      book.title && typeof book.title === "string"
        ? `${ book.title } (BookGeek)`
        : "Book from BookGeek";

    await sendMail({
      to: kindleEmail,
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

    return res.redirect(
      `/kindle/books/${ encodeURIComponent(
        id
      ) }?back=${ encodeURIComponent(back) }${ coverParam }&status=${ encodeURIComponent(
        "Sent"
      ) }`
    );
  } catch (err) {
    console.error("/kindle/books/:id/send error", err);
    const id = req.params.id;
    const back = typeof req.body?.back === "string" ? req.body.back : "/kindle";
    const cover = typeof req.body?.cover === "string" ? req.body.cover : "";
    const coverParam = cover === "1" ? "&cover=1" : "";
    return res.redirect(
      `/kindle/books/${ encodeURIComponent(
        id
      ) }?back=${ encodeURIComponent(back) }${ coverParam }&err=${ encodeURIComponent(
        err?.message || "Send failed"
      ) }`
    );
  }
});

app.get("/api/health", (req, res) => {
  const dbState = mongoose.connection.readyState;
  res.json({
    status: "ok",
    service: "bookgeek-api",
    apiPort: Number(API_PORT),
    db: {
      state: dbState,
    },
  });
});

app.get("/api/me", authenticateToken, meHandler());

app.get("/api/books", authenticateToken, async (req, res) => {
  try {
    if (!MONGODB_URI || mongoose.connection.readyState !== 1) {
      return res.json({ items: [], total: 0, connected: false });
    }

    const {
      page = "1",
      limit = "50",
      sort = "title",
      sortDir = "asc",
      author,
      tag,
      shelf,
      owned,
      q,
    } = req.query;

    const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(String(limit), 10) || 50));

    const andConds = [];

    if (author) {
      andConds.push({ authors: { $regex: String(author), $options: "i" } });
    }
    if (tag) {
      andConds.push({ tags: String(tag) });
    }
    if (shelf) {
      const shelfStr = String(shelf);
      if (shelfStr === "unread") {
        andConds.push({
          $or: [
            { shelf: "unread" },
            { shelf: { $exists: false } },
            { shelf: null },
            { shelf: "" },
          ],
        });
      } else {
        andConds.push({ shelf: shelfStr });
      }
    }
    if (owned === "true") {
      andConds.push({ owned: true });
    } else if (owned === "false") {
      andConds.push({ owned: false });
    }

    if (q) {
      const qStr = String(q);
      andConds.push({
        $or: [
          { title: { $regex: qStr, $options: "i" } },
          { authors: { $regex: qStr, $options: "i" } },
          { tags: { $regex: qStr, $options: "i" } },
        ],
      });
    }

    let filter = {};
    if (andConds.length === 1) {
      filter = andConds[0];
    } else if (andConds.length > 1) {
      filter = { $and: andConds };
    }

    const sortObj = {};
    const dir = String(sortDir).toLowerCase() === "desc" ? -1 : 1;
    const sortKey = String(sort || "title").toLowerCase();

    switch (sortKey) {
      case "author": {
        // sort by first author name, then title for stability
        sortObj["authors.0"] = dir;
        sortObj["title"] = dir;
        break;
      }
      case "rating": {
        sortObj["rating"] = dir;
        sortObj["title"] = 1;
        break;
      }
      case "dateadded": {
        sortObj["dateAdded"] = dir;
        sortObj["title"] = 1;
        break;
      }
      case "datefinished": {
        sortObj["dateFinished"] = dir;
        sortObj["title"] = 1;
        break;
      }
      case "pagecount": {
        sortObj["pageCount"] = dir;
        sortObj["title"] = 1;
        break;
      }
      case "publisheddate": {
        sortObj["publishedDate"] = dir;
        sortObj["title"] = 1;
        break;
      }
      case "owned": {
        sortObj["owned"] = dir;
        sortObj["title"] = 1;
        break;
      }
      case "title":
      default: {
        sortObj["title"] = dir;
        break;
      }
    }

    const skip = (pageNum - 1) * limitNum;

    const [items, total] = await Promise.all([
      Book.find(filter).sort(sortObj).skip(skip).limit(limitNum).lean(),
      Book.countDocuments(filter),
    ]);

    res.json({
      items,
      total,
      page: pageNum,
      pageSize: limitNum,
      connected: true,
    });
  } catch (err) {
    console.error("/api/books error", err);
    res.status(500).json({ error: "Failed to fetch books" });
  }
});

app.post("/api/books", authenticateToken, async (req, res) => {
  try {
    if (!MONGODB_URI || mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "User not available from token" });
    }

    const rawTitle =
      typeof req.body?.title === "string" ? req.body.title.trim() : "";
    if (!rawTitle) {
      return res.status(400).json({ error: "Title is required" });
    }

    let authors = [];
    if (Array.isArray(req.body?.authors)) {
      authors = req.body.authors
        .map((a) => (typeof a === "string" ? a.trim() : ""))
        .filter((a) => a.length > 0);
    } else if (typeof req.body?.authors === "string") {
      authors = req.body.authors
        .split(",")
        .map((a) => a.trim())
        .filter((a) => a.length > 0);
    }

    let tags = [];
    if (Array.isArray(req.body?.tags)) {
      tags = req.body.tags
        .map((t) => (typeof t === "string" ? t.trim() : ""))
        .filter((t) => t.length > 0);
    } else if (typeof req.body?.tags === "string") {
      tags = req.body.tags
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
    }

    const shelfRaw =
      typeof req.body?.shelf === "string" && req.body.shelf.trim()
        ? req.body.shelf.trim()
        : "want-to-read";

    const owned =
      typeof req.body?.owned === "boolean" ? req.body.owned : false;

    const doc = {
      title: rawTitle,
      authors,
      isbn:
        typeof req.body?.isbn === "string" && req.body.isbn.trim()
          ? req.body.isbn.trim()
          : undefined,
      isbn13:
        typeof req.body?.isbn13 === "string" && req.body.isbn13.trim()
          ? req.body.isbn13.trim()
          : undefined,
      publisher:
        typeof req.body?.publisher === "string" && req.body.publisher.trim()
          ? req.body.publisher.trim()
          : undefined,
      description:
        typeof req.body?.description === "string" &&
          req.body.description.trim().length > 0
          ? req.body.description
          : undefined,
      tags: tags.length > 0 ? tags : undefined,
      shelf: shelfRaw,
      owned,
      dateAdded: new Date(),
      source:
        typeof req.body?.source === "string" && req.body.source.trim()
          ? req.body.source.trim()
          : "manual",
    };

    if (typeof req.body?.publishedDate === "string") {
      const d = new Date(req.body.publishedDate);
      if (!Number.isNaN(d.getTime())) {
        doc.publishedDate = d;
      }
    }

    const book = await Book.create(doc);
    const plain = book.toObject ? book.toObject() : book;

    return res.status(201).json({
      success: true,
      data: plain,
    });
  } catch (err) {
    console.error("/api/books POST error", err);
    return res.status(500).json({ error: "Failed to create book" });
  }
});

app.post(
  "/api/books/:id/cover/upload",
  authenticateToken,
  uploadToTemp.single("file"),
  async (req, res) => {
    try {
      if (!MONGODB_URI || mongoose.connection.readyState !== 1) {
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

      const libraryRoot = process.env.LIBRARY_PATH || "/data/library";

      const ext = path
        .extname(file.originalname || file.filename || "")
        .toLowerCase();
      const safeExt = ext || ".jpg";
      const filename = `${ String(book._id) }-upload-${ Date.now() }${ safeExt }`;
      const relPath = resolveCoverRelativePathForBook(book, filename);
      const destPath = path.join(libraryRoot, relPath);

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

app.delete("/api/books/:id/cover", authenticateToken, async (req, res) => {
  try {
    if (!MONGODB_URI || mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const book = await Book.findById(req.params.id);
    if (!book) {
      return res.status(404).json({ error: "Book not found" });
    }

    const libraryRoot = process.env.LIBRARY_PATH || "/data/library";
    if (book.coverPath && typeof book.coverPath === "string") {
      const fullPath = path.join(libraryRoot, book.coverPath);
      await fs.promises.unlink(fullPath).catch(() => { });
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

app.post(
  "/api/books/:id/upload",
  authenticateToken,
  uploadToTemp.single("file"),
  async (req, res) => {
    try {
      if (!MONGODB_URI || mongoose.connection.readyState !== 1) {
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

      const libraryRoot = process.env.LIBRARY_PATH || "/data/library";

      const ext = path.extname(file.originalname || "").toLowerCase();
      const baseName = path.basename(file.originalname || file.filename || "upload", ext) || "upload";
      const safeBase = baseName.replace(/[^a-zA-Z0-9 _.-]/g, "_");
      const finalName = safeBase + (ext || "");

      const destDir = path.join(libraryRoot, "uploads", String(book._id));
      await fs.promises.mkdir(destDir, { recursive: true });
      const destPath = path.join(destDir, finalName);

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

app.get("/api/books/:id/download/:format", async (req, res) => {
  try {
    if (!MONGODB_URI || mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const book = await Book.findById(req.params.id).lean();
    if (!book || !Array.isArray(book.files) || book.files.length === 0) {
      return res.status(404).json({ error: "File not found" });
    }

    const requestedFormat = String(req.params.format || "").toLowerCase();

    let fileEntry = book.files.find(
      (f) => String(f.format || "").toLowerCase() === requestedFormat
    );

    // Fallback: match by file extension if format mismatch
    if (!fileEntry) {
      fileEntry = book.files.find((f) => {
        const ext = path.extname(f.path || "").slice(1).toLowerCase();
        return ext === requestedFormat;
      });
    }

    if (!fileEntry) {
      return res.status(404).json({ error: "Requested format not available" });
    }

    const libraryRoot = process.env.LIBRARY_PATH || "/data/library";
    const fullPath = path.join(libraryRoot, fileEntry.path);

    try {
      const stats = await fs.promises.stat(fullPath);
      if (!stats.isFile()) {
        return res.status(404).json({ error: "File not found" });
      }
    } catch (err) {
      if (err.code !== "ENOENT") {
        console.warn("/api/books/:id/download stat error", {
          bookId: book._id?.toString?.(),
          fullPath,
          error: err.message,
        });
      }
      return res.status(404).json({ error: "File not found" });
    }

    const downloadName = path.basename(fullPath);
    return res.download(fullPath, downloadName, (err) => {
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

app.get("/api/books/:id", authenticateToken, async (req, res) => {
  try {
    if (!MONGODB_URI || mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const book = await Book.findById(req.params.id).lean();
    if (!book) {
      return res.status(404).json({ error: "Book not found" });
    }

    res.json({ success: true, data: book });
  } catch (err) {
    console.error("/api/books/:id error", err);
    res.status(500).json({ error: "Failed to fetch book" });
  }
});

app.patch("/api/books/:id", authenticateToken, async (req, res) => {
  try {
    if (!MONGODB_URI || mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const allowed = {};
    if (typeof req.body?.shelf === "string") {
      allowed.shelf = req.body.shelf;
    }
    if (typeof req.body?.owned === "boolean") {
      allowed.owned = req.body.owned;
    }
    if (typeof req.body?.title === "string") {
      allowed.title = req.body.title;
    }
    if (Array.isArray(req.body?.authors)) {
      allowed.authors = req.body.authors.filter(
        (a) => typeof a === "string" && a.trim().length > 0
      );
    }
    if (Array.isArray(req.body?.tags)) {
      allowed.tags = req.body.tags.filter(
        (t) => typeof t === "string" && t.trim().length > 0
      );
    }
    if (typeof req.body?.language === "string") {
      allowed.language = req.body.language;
    }
    if (typeof req.body?.publisher === "string") {
      allowed.publisher = req.body.publisher;
    }
    if (typeof req.body?.publishedDate === "string" && req.body.publishedDate) {
      const d = new Date(req.body.publishedDate);
      if (!Number.isNaN(d.getTime())) {
        allowed.publishedDate = d;
      }
    }
    if (typeof req.body?.isbn === "string") {
      allowed.isbn = req.body.isbn;
    }
    if (typeof req.body?.isbn13 === "string") {
      allowed.isbn13 = req.body.isbn13;
    }
    if (typeof req.body?.goodreadsId === "string") {
      allowed.goodreadsId = req.body.goodreadsId;
    }
    if (typeof req.body?.rating === "number") {
      allowed.rating = req.body.rating;
    }
    if (typeof req.body?.review === "string") {
      allowed.review = req.body.review;
    }

    if (Object.keys(allowed).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    const updated = await Book.findByIdAndUpdate(
      req.params.id,
      { $set: allowed },
      { new: true, lean: true }
    );

    if (!updated) {
      return res.status(404).json({ error: "Book not found" });
    }

    res.json({ success: true, data: updated });
  } catch (err) {
    console.error("/api/books/:id PATCH error", err);
    res.status(500).json({ error: "Failed to update book" });
  }
});

app.delete("/api/books/:id", authenticateToken, async (req, res) => {
  try {
    if (!MONGODB_URI || mongoose.connection.readyState !== 1) {
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
      const libraryRoot = process.env.LIBRARY_PATH || "/data/library";
      const candidatePaths = [];

      if (Array.isArray(book.files)) {
        for (const f of book.files) {
          if (f && f.path) {
            candidatePaths.push(path.join(libraryRoot, f.path));
          }
        }
      }

      if (book.coverPath) {
        candidatePaths.push(path.join(libraryRoot, book.coverPath));
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

app.post("/api/books/merge", authenticateToken, async (req, res) => {
  try {
    if (!MONGODB_URI || mongoose.connection.readyState !== 1) {
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

app.get("/api/books/:id/cover", async (req, res) => {
  try {
    if (!MONGODB_URI || mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const book = await Book.findById(req.params.id).lean();
    if (!book) {
      return res.status(404).json({ error: "Cover not found" });
    }

    const libraryRoot = process.env.LIBRARY_PATH || "/data/library";

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
      const full = path.join(libraryRoot, rel);
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

app.get("/api/shelves", authenticateToken, async (req, res) => {
  try {
    if (!MONGODB_URI || mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const shelfNames = [
      "unread",
      "reading",
      "read",
      "want-to-read",
      "abandoned",
      "need-to-find",
    ];

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

    const shelves = {};
    for (const name of shelfNames) {
      shelves[name] = 0;
    }
    for (const row of shelfCounts) {
      if (row._id && typeof row.count === "number") {
        shelves[row._id] = row.count;
      }
    }

    if (typeof unshelvedCount === "number" && unshelvedCount > 0) {
      shelves["unread"] = (shelves["unread"] || 0) + unshelvedCount;
    }

    res.json({
      success: true,
      data: {
        total,
        owned,
        unowned: Math.max(0, total - owned),
        shelves,
      },
    });
  } catch (err) {
    console.error("/api/shelves error", err);
    res.status(500).json({ error: "Failed to fetch shelf counts" });
  }
});

app.get("/api/profile/me", authenticateToken, async (req, res) => {
  try {
    if (!MONGODB_URI || mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "User not available from token" });
    }

    const profile = await Profile.findOne({ userId }).lean();
    res.json({ success: true, data: profile || null });
  } catch (err) {
    console.error("/api/profile/me error", err);
    res.status(500).json({ error: "Failed to load profile" });
  }
});

app.put("/api/profile/me", authenticateToken, async (req, res) => {
  try {
    if (!MONGODB_URI || mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "User not available from token" });
    }

    const update = {};
    if (typeof req.body?.kindleEmail === "string") {
      update.kindleEmail = req.body.kindleEmail.trim();
    }

    const updateDoc = {
      $set: update,
      $setOnInsert: { userId },
    };

    const profile = await Profile.findOneAndUpdate(
      { userId },
      updateDoc,
      { upsert: true, new: true, lean: true }
    );

    res.json({ success: true, data: profile });
  } catch (err) {
    console.error("/api/profile/me PUT error", err);
    res.status(500).json({ error: "Failed to save profile" });
  }
});

app.get("/api/profile/library-filters", authenticateToken, async (req, res) => {
  try {
    if (!MONGODB_URI || mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "User not available from token" });
    }

    const profile = await Profile.findOne({ userId }).lean();
    const filters = Array.isArray(profile?.savedFilters)
      ? profile.savedFilters
      : [];

    return res.json({ success: true, data: filters });
  } catch (err) {
    console.error("/api/profile/library-filters GET error", err);
    return res
      .status(500)
      .json({ error: "Failed to load saved library filters" });
  }
});

app.post("/api/profile/library-filters", authenticateToken, async (req, res) => {
  try {
    if (!MONGODB_URI || mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "User not available from token" });
    }

    const rawName = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!rawName) {
      return res.status(400).json({ error: "Filter name is required" });
    }

    const preset = {
      id: generateFilterId(),
      name: rawName,
      sortBy:
        typeof req.body?.sortBy === "string" && req.body.sortBy
          ? req.body.sortBy
          : undefined,
      sortDir:
        typeof req.body?.sortDir === "string" && req.body.sortDir
          ? req.body.sortDir
          : "asc",
      searchQuery:
        typeof req.body?.searchQuery === "string" ? req.body.searchQuery : "",
      authorFilter:
        typeof req.body?.authorFilter === "string" ? req.body.authorFilter : "",
      tagFilter:
        typeof req.body?.tagFilter === "string" ? req.body.tagFilter : "",
      shelfFilter:
        typeof req.body?.shelfFilter === "string" && req.body.shelfFilter
          ? req.body.shelfFilter
          : "all",
      ownedFilter: (() => {
        const raw =
          typeof req.body?.ownedFilter === "string" && req.body.ownedFilter
            ? req.body.ownedFilter
            : "all";
        if (raw === "owned" || raw === "unowned") return raw;
        return "all";
      })(),
      ownedOnly: (() => {
        // Backward compatibility: prefer explicit ownedFilter, but
        // also respect legacy boolean ownedOnly from clients.
        const rawFilter =
          typeof req.body?.ownedFilter === "string" && req.body.ownedFilter
            ? req.body.ownedFilter
            : null;
        if (rawFilter === "owned") return true;
        if (rawFilter === "unowned") return false;
        return !!req.body?.ownedOnly;
      })(),
    };

    const profile = await Profile.findOneAndUpdate(
      { userId },
      {
        $setOnInsert: { userId },
        $push: { savedFilters: preset },
      },
      { upsert: true, new: true, lean: true }
    );

    const filters = Array.isArray(profile?.savedFilters)
      ? profile.savedFilters
      : [];

    return res.json({
      success: true,
      data: {
        filter: preset,
        filters,
      },
    });
  } catch (err) {
    console.error("/api/profile/library-filters POST error", err);
    return res
      .status(500)
      .json({ error: "Failed to save library filter preset" });
  }
});

app.delete(
  "/api/profile/library-filters/:id",
  authenticateToken,
  async (req, res) => {
    try {
      if (!MONGODB_URI || mongoose.connection.readyState !== 1) {
        return res.status(503).json({ error: "Database not connected" });
      }

      const userId = req.user?.id;
      if (!userId) {
        return res
          .status(401)
          .json({ error: "User not available from token" });
      }

      const presetId = req.params.id;
      if (!presetId) {
        return res.status(400).json({ error: "Filter id is required" });
      }

      const profile = await Profile.findOneAndUpdate(
        { userId },
        { $pull: { savedFilters: { id: presetId } } },
        { new: true, lean: true }
      );

      const filters = Array.isArray(profile?.savedFilters)
        ? profile.savedFilters
        : [];

      return res.json({ success: true, data: { filters } });
    } catch (err) {
      console.error("/api/profile/library-filters DELETE error", err);
      return res
        .status(500)
        .json({ error: "Failed to delete library filter preset" });
    }
  }
);

app.post(
  "/api/books/:id/send-to-kindle",
  authenticateToken,
  async (req, res) => {
    try {
      if (!MONGODB_URI || mongoose.connection.readyState !== 1) {
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

      const libraryRoot = process.env.LIBRARY_PATH || "/data/library";
      const fullPath = path.join(libraryRoot, epubFile.path);

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

          console.log("send-to-kindle smtp result", {
            userId,
            kindleEmail: profile.kindleEmail,
            bookId: book._id?.toString?.(),
            filePath: epubFile.path,
            sent: result?.sent,
          });

          return res.json({
            success: true,
            data: {
              sent: !!result?.sent,
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

      console.log("send-to-kindle stub", {
        userId,
        kindleEmail: profile.kindleEmail,
        bookId: book._id?.toString?.(),
        filePath: epubFile.path,
      });

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

app.get("/api/books/:id/search-covers", authenticateToken, async (req, res) => {
  try {
    if (!MONGODB_URI || mongoose.connection.readyState !== 1) {
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

app.post("/api/books/:id/cover", authenticateToken, async (req, res) => {
  try {
    if (!MONGODB_URI || mongoose.connection.readyState !== 1) {
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
      if (!/^https?:\/\//i.test(coverUrl)) {
        return res.status(400).json({ error: "coverUrl must be http(s)" });
      }

      try {
        const resImg = await fetch(coverUrl);
        if (!resImg.ok) {
          return res
            .status(502)
            .json({ error: "Failed to download cover image" });
        }
        const arrayBuffer = await resImg.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const libraryRoot = process.env.LIBRARY_PATH || "/data/library";

        const filename = `${ String(book._id) }-gb-${ Date.now() }.jpg`;
        const relPath = resolveCoverRelativePathForBook(book, filename);
        const destPath = path.join(libraryRoot, relPath);
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

app.post("/api/books/:id/enrich", authenticateToken, async (req, res) => {
  try {
    if (!MONGODB_URI || mongoose.connection.readyState !== 1) {
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

function normalizeIsbn(value) {
  if (!value) return null;
  const digits = String(value).replace(/[^0-9Xx]/g, "");
  return digits || null;
}

function extractOpenLibraryDescription(desc) {
  if (!desc) return null;
  if (typeof desc === "string") return desc;
  if (typeof desc === "object" && typeof desc.value === "string") {
    return desc.value;
  }
  return null;
}

function decodeBasicHtmlEntities(input) {
  if (typeof input !== "string") return "";
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function normalizeDescription(raw) {
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

function descriptionScore(desc) {
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

function shouldReplaceDescription(existingDesc, candidateDesc) {
  const candidateNorm = normalizeDescription(candidateDesc);
  if (!candidateNorm) return false;
  const existingScore = descriptionScore(existingDesc);
  const candidateScore = descriptionScore(candidateNorm);
  if (existingScore === 0) return candidateScore > 0;
  if (existingScore <= 80 && candidateScore > existingScore + 60) return true;
  return false;
}

function generateFilterId() {
  return (
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 8)
  );
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });
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

async function fetchOpenLibraryByIsbn(isbn) {
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

async function fetchOpenLibraryByTitleAuthor(title, author) {
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

function resolveCoverRelativePathForBook(book, filename) {
  const defaultDir = "covers";
  if (!book || typeof book !== "object") {
    return path.join(defaultDir, filename);
  }

  let baseDirRel = null;

  if (Array.isArray(book.files) && book.files.length > 0) {
    const firstPath = book.files[0]?.path;
    if (typeof firstPath === "string" && firstPath.trim()) {
      baseDirRel = path.dirname(firstPath);
    }
  }

  if (!baseDirRel && typeof book.coverPath === "string" && book.coverPath.trim()) {
    baseDirRel = path.dirname(book.coverPath);
  }

  if (!baseDirRel) {
    baseDirRel = defaultDir;
  }

  return path.join(baseDirRel, filename);
}

async function downloadOpenLibraryCover(coverId, bookOrId) {
  if (!coverId || !bookOrId) return null;
  const url = `https://covers.openlibrary.org/b/id/${ coverId }-L.jpg`;
  const res = await fetch(url);
  if (!res.ok) {
    return null;
  }
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const libraryRoot = process.env.LIBRARY_PATH || "/data/library";

  let book = bookOrId;
  if (!book || typeof book !== "object" || !book._id) {
    try {
      book = await Book.findById(bookOrId).lean();
    } catch {
      book = null;
    }
  }

  const idForName =
    (book && book._id && String(book._id)) || String(bookOrId);
  const filename = `${ idForName }-ol-${ coverId }.jpg`;
  const relPath = resolveCoverRelativePathForBook(book, filename);
  const destPath = path.join(libraryRoot, relPath);

  await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
  await fs.promises.writeFile(destPath, buffer);

  const finalRel = path.relative(libraryRoot, destPath);
  return finalRel;
}

async function moveFileSafe(src, dest) {
  if (!src || !dest) {
    throw new Error("moveFileSafe requires src and dest");
  }
  try {
    await fs.promises.rename(src, dest);
    return;
  } catch (err) {
    if (err && err.code === "EXDEV") {
      await new Promise((resolve, reject) => {
        const read = fs.createReadStream(src);
        const write = fs.createWriteStream(dest);

        const onError = (e) => {
          read.destroy();
          write.destroy();
          reject(e);
        };

        read.on("error", onError);
        write.on("error", onError);
        write.on("close", resolve);

        read.pipe(write);
      });

      await fs.promises.unlink(src).catch(() => { });
      return;
    }
    throw err;
  }
}

function extractOpenLibraryLanguage(languages) {
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

function chooseBestCalibreFile(book) {
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

async function extractCalibreCoverIfMissing(book, fullPath, update, updatedFields) {
  if (!book || !fullPath) return false;
  if (book.coverPath && typeof book.coverPath === "string") {
    return false;
  }
  const tmpDir = TEMP_PATH || "/data/temp";
  const tmpName = `calibre-cover-${ String(book._id) }-${ Date.now() }.jpg`;
  const tmpPath = path.join(tmpDir, tmpName);
  try {
    await fs.promises.mkdir(tmpDir, { recursive: true });
  } catch { }
  try {
    await execFileAsync(CALIBRE_EBOOK_META_BIN, [fullPath, "--get-cover", tmpPath], {
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

async function tryCalibreEnrich(book, update, updatedFields, sourceParts) {
  try {
    const bestFile = chooseBestCalibreFile(book);
    if (!bestFile || !bestFile.path) {
      return;
    }
    const libraryRoot = process.env.LIBRARY_PATH || "/data/library";
    const fullPath = path.join(libraryRoot, bestFile.path);
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

app.use(express.static(publicPath));

app.get(/^\/(?!api(?:\/|$)|kindle(?:\/|$)).*/, (req, res) => {
  return res.sendFile(path.join(publicPath, "index.html"));
});

async function start() {
  if (!MONGODB_URI) {
    console.warn(
      "BASEGEEK_MONGODB_URI is not set; starting API without MongoDB connection."
    );
  } else {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log("Connected to MongoDB");
  }

  app.listen(API_PORT, "0.0.0.0", () => {
    console.log(`bookgeek-api listening on http://0.0.0.0:\${API_PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start bookgeek-api", err);
  process.exit(1);
});
