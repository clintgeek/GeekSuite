/**
 * Kindle micro-UI helpers: the PIN cookie, the bare-HTML layout, and the
 * two auth guards (PIN only, or geek_token OR PIN). Moved verbatim out of
 * server.js (Phase B, 2026-09-25). Env is read per call via config.js, so
 * importing this module has no side effects.
 */
import crypto from "crypto";
import { Profile } from "./models/profile.js";
import { authenticateToken } from "./middleware/auth.js";
import { kindleCookieSecret, kindlePin } from "./config.js";

export const KINDLE_UI_COOKIE_NAME = "bookgeek_kindle";

export function parseCookies(req) {
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

export function kindleAuthCookieValue() {
  if (!kindleCookieSecret()) return null;
  return crypto
    .createHmac("sha256", kindleCookieSecret())
    .update("kindle-ui")
    .digest("hex");
}

export function isHttpsRequest(req) {
  const proto = String(req.headers?.["x-forwarded-proto"] || "").toLowerCase();
  if (proto === "https") return true;
  return !!req.secure;
}

export function setCookie(res, name, value, opts = {}) {
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

export function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function kindleLayout(title, bodyHtml) {
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

export function kindleNotConfigured(res) {
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

export function requireKindleAuth(req, res, next) {
  if (!kindlePin()) {
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

// Accept either a valid geek_token (SPA / API clients) OR a valid Kindle
// PIN cookie (server-rendered /kindle pages that embed <img src="/api/.../cover">).
// Used to protect endpoints that must be consumable by both surfaces.
export function authenticateTokenOrKindle(req, res, next) {
  if (kindlePin()) {
    const expected = kindleAuthCookieValue();
    const cookies = parseCookies(req);
    const actual = cookies[KINDLE_UI_COOKIE_NAME];
    if (expected && actual === expected) {
      return next();
    }
  }
  return authenticateToken(req, res, next);
}

export async function resolveKindleTargetEmail() {
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
