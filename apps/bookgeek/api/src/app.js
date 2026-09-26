/**
 * Build the BookGeek API Express app. No Mongo connect, no listen — that is
 * server.js's job — so this module imports cleanly in tests and in
 * tools/boot-smoke.mjs (Phase B, 2026-09-25; the gamegeek/bujogeek shape).
 *
 * ORDER MATTERS and is exactly the order the old monolithic server.js used:
 *   trust proxy → csrfGuard → cors → cookie/body parsers → http logger →
 *   /api/auth → /api/import → /kindle* → /api/health, /api/me →
 *   /api/books/* (bytes) → device baskets → static → SPA fallback (last).
 */
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createHttpLogger } from "@geeksuite/logger";
import { csrfGuard } from "@geeksuite/user/server";
import { isAllowedCorsOrigin } from "./corsOrigins.js";
import { logger } from "./utils/logger.js";
import authRouter from "./routes/authRoutes.js";
import importRouter from "./routes/importRoutes.js";
import kindleRouter from "./routes/kindleRoutes.js";
import healthRouter from "./routes/healthRoutes.js";
import bookFileRouter from "./routes/bookFileRoutes.js";
import deviceBasketRouter from "./deviceBasket.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_PUBLIC_PATH = path.join(__dirname, "../public");

/**
 * @param {object} [options]
 * @param {string} [options.publicPath] the built SPA (defaults to ../public,
 *   where the Dockerfile copies web/dist). Tests point it at a fixture.
 */
export function createApp({ publicPath = DEFAULT_PUBLIC_PATH } = {}) {
  const app = express();
  // Behind the suite's nginx. Without this `req.ip` is the proxy's address for
  // every caller — which would collapse deviceBasket.js's per-IP secret-word
  // rate limit into one global bucket (one wrong guess locking out everyone) —
  // and `req.secure` is always false, so the Kindle PIN cookie would never get
  // its Secure attribute. One hop: nginx is the only proxy in front of us.
  app.set("trust proxy", 1);

  // CSRF: origin-check every cookie-authenticated mutation with the same
  // predicate cors() uses (src/corsOrigins.js — one rule, no second copy).
  //
  // Mounted *before* cors() on purpose. This cors() config answers a
  // disallowed Origin with `cb(new Error(...))`, which express turns into a
  // generic 500 — so a CSRF attempt would otherwise look like an application
  // bug, and would stop being blocked at all the moment someone "tidied" that
  // callback into the equally idiomatic `cb(null, false)` (which lets the
  // request through without the CORS header). Running first makes the
  // rejection a deliberate, tested 403 that does not depend on how cors()
  // reports a mismatch.
  //
  // No path exemptions. The server-rendered /kindle and /download-basket form
  // POSTs authenticate with their own PIN / basket-word cookies, not
  // geek_token, so the guard passes them straight through; when they *are*
  // driven from a logged-in desktop browser at bookgeek.clintgeek.com the form
  // posts same-origin and is allow-listed anyway. See DOCS/SSO_OVERVIEW.md#csrf.
  app.use(csrfGuard({ allowedOrigins: isAllowedCorsOrigin, logger, appName: "bookgeek" }));

  app.use(
    cors({
      origin(origin, cb) {
        if (isAllowedCorsOrigin(origin)) return cb(null, true);
        return cb(new Error("Not allowed by CORS"));
      },
      credentials: true,
    })
  );
  app.use(cookieParser());
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  const httpLogger = createHttpLogger(logger);
  app.use((req, res, next) => {
    httpLogger(req, res);
    res.setHeader("X-Request-Id", req.id);
    next();
  });
  app.use("/api/auth", authRouter);
  // /api/ai was one route, GET /status, and it reported on bookgeek's own
  // AIGEEK_API_KEY env var. It moved to the gateway's `bookAiStatus` query
  // 2026-09-05, where the same question is answered against basegeek's actual
  // provider config — basegeek is where bookgeek's AI was always routed.
  app.use("/api/import", importRouter);

  // Server-rendered Kindle micro-UI (/kindle*).
  app.use(kindleRouter);
  // GET /api/health, GET /api/me.
  app.use(healthRouter);
  // /api/books/:id/* bytes and long jobs, DELETE /api/books/:id, merge.
  // The /api/profile/* routes moved to basegeek's gateway 2026-09-05.
  app.use(bookFileRouter);

  // Device basket routes — POST /api/device-baskets (auth) and public
  // /download-basket/:slug pages/downloads. Must be registered before the SPA
  // static + index.html fallback so /download-basket/* is not swallowed by it.
  app.use(deviceBasketRouter);

  app.use(express.static(publicPath, {
    setHeaders(res, filePath) {
      // Vite content-hashes everything under assets/ — cache forever.
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
    },
  }));

  // SPA fallback — LAST.
  app.get(/^\/(?!api(?:\/|$)|kindle(?:\/|$)|download-basket(?:\/|$)).*/, (req, res) => {
    // Paths with a file extension (e.g. a stale hashed /assets/*.css requested
    // by an old service worker after a deploy) must 404 — answering them with
    // index.html poisons browser/SW caches and renders the app unstyled.
    if (path.extname(req.path)) {
      return res.status(404).type("text/plain").send("Not found");
    }
    return res.sendFile(path.join(publicPath, "index.html"));
  });

  return app;
}

export default createApp;
