import { serve } from "bun";
import path from "path";

const root = "/app";
const port = Number(process.env.FRONTEND_PORT || 1801);

const kindleUpstreamBase = String(process.env.KINDLE_UI_UPSTREAM || "http://api:1800").replace(
  /\/$/,
  ""
);

function guessContentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) return "image/jpeg";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".webmanifest")) return "application/manifest+json; charset=utf-8";
  return "application/octet-stream";
}

serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);
    let pathname = url.pathname;

    if (pathname === "/kindle" || pathname.startsWith("/kindle/")) {
      const targetUrl = `${kindleUpstreamBase}${pathname}${url.search || ""}`;

      const headers = new Headers(req.headers);
      headers.delete("host");
      headers.delete("content-length");
      headers.delete("connection");

      const init = {
        method: req.method,
        headers,
        redirect: "manual",
      };
      if (req.method !== "GET" && req.method !== "HEAD") {
        init.body = req.body;
      }
      return fetch(targetUrl, init);
    }

    if (pathname === "/") {
      pathname = "/index.html";
    }

    const filePath = path.join(root, pathname);
    const file = Bun.file(filePath);

    if (await file.exists()) {
      return new Response(file, {
        headers: {
          "Content-Type": guessContentType(filePath),
        },
      });
    }

    // Fallback to index.html for SPA routes
    const indexFile = Bun.file(path.join(root, "index.html"));
    return new Response(indexFile, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  },
});
