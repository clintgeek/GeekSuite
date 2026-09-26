/**
 * The server-rendered Kindle micro-UI: /kindle, /kindle/login, /kindle/logout,
 * /kindle/style.css, /kindle/books/:id and its send form. Bare HTML on
 * purpose — the Kindle browser cannot run the SPA. See DOCS/CONTEXT.md.
 */
import express from "express";
import path from "path";
import { Book } from "../models/book.js";
import { escapeRegex, resolveInLibrary } from "../libraryPaths.js";
import { sendMail } from "../services/emailService.js";
import { normalizeDescription } from "../services/enrichment.js";
import { dbConnected, kindlePin } from "../config.js";
import {
  KINDLE_UI_COOKIE_NAME,
  escapeHtml,
  isHttpsRequest,
  kindleAuthCookieValue,
  kindleLayout,
  kindleNotConfigured,
  requireKindleAuth,
  resolveKindleTargetEmail,
  setCookie,
} from "../kindleUi.js";

const router = express.Router();

router.get("/kindle/style.css", (req, res) => {
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

router.get("/kindle/login", (req, res) => {
  if (!kindlePin()) {
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

router.post("/kindle/login", (req, res) => {
  if (!kindlePin()) {
    return kindleNotConfigured(res);
  }
  const pin = typeof req.body?.pin === "string" ? req.body.pin.trim() : "";
  const nextUrl = typeof req.body?.next === "string" ? req.body.next : "/kindle";
  if (!pin || pin !== kindlePin()) {
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

router.get("/kindle/logout", (req, res) => {
  setCookie(res, KINDLE_UI_COOKIE_NAME, "", {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    secure: isHttpsRequest(req),
    maxAgeSeconds: 0,
  });
  return res.redirect("/kindle/login");
});

router.get("/kindle", requireKindleAuth, async (req, res) => {
  try {
    if (!dbConnected()) {
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
      // Escaped: a raw search box straight into $regex is both a regex
      // injection and a ReDoS lever (`(a+)+$` pins the Mongo thread).
      const qRe = escapeRegex(q);
      andConds.push({
        $or: [
          { title: { $regex: qRe, $options: "i" } },
          { authors: { $regex: qRe, $options: "i" } },
          { tags: { $regex: qRe, $options: "i" } },
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

router.get("/kindle/books/:id", requireKindleAuth, async (req, res) => {
  try {
    if (!dbConnected()) {
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

router.post("/kindle/books/:id/send", requireKindleAuth, async (req, res) => {
  try {
    if (!dbConnected()) {
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

    const fullPath = resolveInLibrary(epubFile.path);
    if (!fullPath) {
      return res.redirect(
        `/kindle/books/${ encodeURIComponent(
          id
        ) }?back=${ encodeURIComponent(back) }${ coverParam }&err=${ encodeURIComponent(
          "Stored file path is outside the library"
        ) }`
      );
    }

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

    const mailResult = await sendMail({
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

    if (!mailResult?.sent) {
      return res.redirect(
        `/kindle/books/${ encodeURIComponent(
          id
        ) }?back=${ encodeURIComponent(back) }${ coverParam }&err=${ encodeURIComponent(
          "Email delivery is not configured on the server"
        ) }`
      );
    }

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

export default router;
