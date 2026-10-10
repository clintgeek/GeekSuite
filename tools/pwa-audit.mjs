#!/usr/bin/env node
// PWA audit: checks each app's BUILT output (dist/) for the things that make a
// GeekSuite app installable, correctly branded and safe to deploy.
//
//   node tools/pwa-audit.mjs                     # every app; each must be built
//   node tools/pwa-audit.mjs --app notegeek      # one app (repeatable, or a,b,c)
//   node tools/pwa-audit.mjs --json              # machine-readable report
//
// No dependencies and no network: it reads files, PNG headers and the built
// service worker's source. Exit code 1 on any problem, 2 on bad usage.
//
// What it checks, per app (DOCS/PWA_STANDARD.md is the why):
//   index.html  one <link rel="manifest">; an SVG <link rel="icon"> that
//               exists; an apple-touch-icon that is a 180x180 PNG with no
//               alpha channel; theme-color metas (a light AND a dark one if
//               either uses `media`).
//   manifest    name, short_name, description, id, start_url, scope,
//               display: standalone, hex theme_color/background_color, and
//               theme_color equal to one of index.html's theme-color metas.
//               Icons: every file exists and its PNG pixel size matches
//               `sizes`; a 192 and a 512 "any" PNG; a 512 "maskable" PNG; no
//               combined "any maskable" (it crops the "any" icon).
//   sw          a service worker exists and is registered; auth endpoints
//               bypass the cache; every hashed assets/*.js|css is precached;
//               every .woff2 is precached or covered by a runtime font rule;
//               offline.html (if the app ships one) is precached.
//               Workbox: cleanupOutdatedCaches, skipWaiting + clientsClaim,
//               and the navigateFallback denylist keeps the SPA shell away
//               from /api, /graphql and any path with a file extension.
//               Sealed paths (NEVER_CACHED: ThingGeek's /api/attic) get a
//               NetworkOnly route registered before any caching route.
//               Hand-rolled: BUILD_ID/PRECACHE_ASSETS were stamped, a
//               text/html guard sits ahead of cache.put, and it never
//               answers a navigation with index.html.
//   leftovers   no template icons (vite.svg) in the build.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// The ten frontends, and where each one builds to. Keep in step with the
// build-frontends matrix in .github/workflows/ci.yml and tools/pwa-icons.mjs.
export const APPS = {
  basegeek: 'apps/basegeek/packages/ui',
  bookgeek: 'apps/bookgeek/web',
  todogeek: 'apps/todogeek/frontend',
  fitnessgeek: 'apps/fitnessgeek/frontend',
  flockgeek: 'apps/flockgeek/frontend',
  gamegeek: 'apps/gamegeek/frontend',
  notegeek: 'apps/notegeek/frontend',
  startgeek: 'apps/startgeek',
  storygeek: 'apps/storygeek/frontend',
  thinggeek: 'apps/thinggeek/frontend',
  newsgeek: 'apps/newsgeek/frontend',
};

// Paths no service worker may ever cache (DOCS/THINGGEEK_PLAN.md "The Attic").
const NEVER_CACHED = {
  thinggeek: { path: '/api/attic', cacheName: 'attic-no-store' },
};

// Navigations the SPA shell must never answer, and ones it must.
const MUST_DENY = ['/api/me', '/api/auth/callback', '/api/files/abc', '/graphql', '/assets/index-DEAD.js', '/sw.js', '/manifest.json', '/icons/icon-512.png'];
const MUST_ALLOW = ['/', '/some/deep/route'];

// ─── small readers ──────────────────────────────────────────────────────────

/** Width, height and colour type from a PNG's IHDR, or null if not a PNG. */
export function pngInfo(buf) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buf.length < 29 || !sig.every((b, i) => buf[i] === b)) return null;
  if (buf.toString('ascii', 12, 16) !== 'IHDR') return null;
  const colorType = buf[25];
  // 4 = grey+alpha, 6 = RGBA. A tRNS chunk would add alpha to the others.
  const hasAlpha = colorType === 4 || colorType === 6 || buf.includes(Buffer.from('tRNS'));
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), colorType, hasAlpha };
}

function attrs(tag) {
  const out = {};
  for (const m of tag.matchAll(/([a-zA-Z:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    out[m[1].toLowerCase()] = m[3] ?? m[4] ?? m[5];
  }
  return out;
}

function tags(html, name) {
  return [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map((m) => attrs(m[0]));
}

/** Read the regex literals out of a minified `key:[/a/,/b/g]` array. */
export function regexArrayAfter(src, key, from = 0) {
  const at = src.indexOf(`${key}:[`, from);
  if (at === -1) return null;
  const out = [];
  let i = at + key.length + 2;
  while (i < src.length) {
    const c = src[i];
    if (c === ']') return out;
    if (c === ',' || c === ' ') { i++; continue; }
    if (c !== '/') return out; // not a plain regex list; stop honestly
    let j = i + 1;
    let inClass = false;
    for (; j < src.length; j++) {
      const d = src[j];
      if (d === '\\') { j++; continue; }
      if (d === '[') inClass = true;
      else if (d === ']') inClass = false;
      else if (d === '/' && !inClass) break;
    }
    const body = src.slice(i + 1, j);
    let k = j + 1;
    while (/[a-z]/.test(src[k])) k++;
    out.push(new RegExp(body, src.slice(j + 1, k)));
    i = k;
  }
  return out;
}

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const HEX = /^#[0-9a-f]{6}$/i;
const norm = (u) => '/' + String(u).replace(/^\.?\//, '').split(/[?#]/)[0];

// ─── the audit ──────────────────────────────────────────────────────────────

export function auditApp(name, distDir) {
  const problems = [];
  const notes = [];
  const bad = (area, msg) => problems.push(`${area}: ${msg}`);

  if (!fs.existsSync(path.join(distDir, 'index.html'))) {
    bad('build', `no ${path.relative(ROOT, distDir)}/index.html — build the app first`);
    return { name, problems, notes };
  }
  const file = (u) => path.join(distDir, norm(u));
  const exists = (u) => fs.existsSync(file(u));
  const html = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
  const links = tags(html, 'link');
  const metas = tags(html, 'meta');
  const rel = (r) => links.filter((l) => (l.rel || '').toLowerCase().split(/\s+/).includes(r));

  // index.html ──────────────────────────────────────────────────────────────
  const icons = rel('icon');
  const svgIcon = icons.find((l) => /\.svg(\?|$)/.test(l.href || '') || l.type === 'image/svg+xml');
  if (!svgIcon) bad('index.html', 'no SVG <link rel="icon">');
  for (const l of icons) {
    if (l.href?.startsWith('data:')) bad('index.html', 'favicon is an inline data: URI — ship icons/favicon.svg instead');
    else if (l.href && !exists(l.href)) bad('index.html', `icon ${l.href} is not in dist/`);
  }
  const touch = rel('apple-touch-icon');
  if (touch.length === 0) bad('index.html', 'no <link rel="apple-touch-icon">');
  for (const l of touch) {
    if (!l.href || !exists(l.href)) { bad('index.html', `apple-touch-icon ${l.href} is not in dist/`); continue; }
    const info = pngInfo(fs.readFileSync(file(l.href)));
    if (!info) bad('index.html', `apple-touch-icon ${l.href} is not a PNG (iOS ignores SVG)`);
    else {
      if (info.width !== 180 || info.height !== 180) bad('index.html', `apple-touch-icon is ${info.width}x${info.height}, want 180x180`);
      if (info.hasAlpha) bad('index.html', 'apple-touch-icon has an alpha channel; iOS paints transparency black — flatten it');
    }
  }
  const themeMetas = metas.filter((m) => (m.name || '').toLowerCase() === 'theme-color');
  if (themeMetas.length === 0) bad('index.html', 'no <meta name="theme-color">');
  if (themeMetas.some((m) => m.media)) {
    for (const scheme of ['light', 'dark']) {
      if (!themeMetas.some((m) => (m.media || '').includes(scheme))) bad('index.html', `theme-color has media variants but none for ${scheme}`);
    }
  }
  for (const m of themeMetas) if (!HEX.test(m.content || '')) bad('index.html', `theme-color "${m.content}" is not a #rrggbb hex`);

  // manifest ────────────────────────────────────────────────────────────────
  const manifestLinks = rel('manifest');
  if (manifestLinks.length !== 1) bad('index.html', `${manifestLinks.length} <link rel="manifest"> (want exactly 1)`);
  let manifest = null;
  if (manifestLinks[0]) {
    const href = manifestLinks[0].href;
    if (!exists(href)) bad('manifest', `${href} is not in dist/`);
    else {
      try { manifest = JSON.parse(fs.readFileSync(file(href), 'utf8')); } catch (e) { bad('manifest', `${href} is not JSON: ${e.message}`); }
    }
  }
  if (manifest) {
    for (const k of ['name', 'short_name', 'description', 'id', 'start_url', 'scope']) {
      if (!manifest[k]) bad('manifest', `missing "${k}"`);
    }
    if (manifest.display !== 'standalone') bad('manifest', `display is "${manifest.display}", want "standalone"`);
    for (const k of ['theme_color', 'background_color']) {
      if (!HEX.test(manifest[k] || '')) bad('manifest', `${k} "${manifest[k]}" is not a #rrggbb hex`);
    }
    if (themeMetas.length && manifest.theme_color &&
        !themeMetas.some((m) => (m.content || '').toLowerCase() === manifest.theme_color.toLowerCase())) {
      bad('manifest', `theme_color ${manifest.theme_color} matches none of index.html's theme-color metas (${themeMetas.map((m) => m.content).join(', ')})`);
    }
    const list = Array.isArray(manifest.icons) ? manifest.icons : [];
    const found = { any192: false, any512: false, mask512: false };
    for (const icon of list) {
      const purposes = (icon.purpose || 'any').split(/\s+/);
      if (purposes.includes('any') && purposes.includes('maskable')) {
        bad('manifest', `${icon.src} is "any maskable" — give maskable its own full-bleed icon`);
      }
      if (!icon.src || !exists(icon.src)) { bad('manifest', `icon ${icon.src} is not in dist/`); continue; }
      if (!/png/.test(icon.type || '') && !/\.png$/.test(icon.src)) continue; // SVG "any" is a bonus
      const info = pngInfo(fs.readFileSync(file(icon.src)));
      if (!info) { bad('manifest', `icon ${icon.src} is not a PNG`); continue; }
      const want = String(icon.sizes || '');
      if (want !== `${info.width}x${info.height}`) bad('manifest', `icon ${icon.src} says ${want} but is ${info.width}x${info.height}`);
      if (purposes.includes('any') && info.width === 192) found.any192 = true;
      if (purposes.includes('any') && info.width === 512) found.any512 = true;
      if (purposes.includes('maskable') && info.width === 512) {
        found.mask512 = true;
        if (info.hasAlpha) notes.push(`maskable ${icon.src} has an alpha channel (fine if fully opaque)`);
      }
    }
    if (!found.any192) bad('manifest', 'no 192x192 PNG icon with purpose "any"');
    if (!found.any512) bad('manifest', 'no 512x512 PNG icon with purpose "any"');
    if (!found.mask512) bad('manifest', 'no 512x512 PNG icon with purpose "maskable"');
  }

  // service worker ──────────────────────────────────────────────────────────
  const swPath = path.join(distDir, 'sw.js');
  const all = walk(distDir);
  const rels = all.map((p) => '/' + path.relative(distDir, p).split(path.sep).join('/'));
  const hashed = rels.filter((r) => r.startsWith('/assets/') && /\.(js|css)$/.test(r));
  const woff2 = rels.filter((r) => r.endsWith('.woff2'));
  const hasOffline = rels.includes('/offline.html');

  if (!fs.existsSync(swPath)) {
    bad('sw', 'no dist/sw.js');
  } else {
    const sw = fs.readFileSync(swPath, 'utf8');
    // Hand-rolled apps register inline or in the entry; VitePWA apps via
    // virtual:pwa-register, which lazy-loads a workbox-window chunk.
    const registered = /serviceWorker|registerSW/.test(html) ||
      rels.some((r) => /^\/assets\/workbox-window[^/]*\.js$/.test(r)) ||
      all.some((p) => p.includes(`${path.sep}assets${path.sep}`) && p.endsWith('.js') &&
        /serviceWorker\.register\(/.test(fs.readFileSync(p, 'utf8')));
    if (!registered) bad('sw', 'nothing in index.html or the bundle registers the service worker');
    if (!sw.includes('/api/me')) bad('sw', 'no auth bypass for /api/me (PWA_STANDARD rule 1)');

    // Sealed routes (ThingGeek's Attic): a NetworkOnly route, registered
    // before ANY caching route — workbox takes the first match, and an Attic
    // <img> would otherwise fall into the image/asset cache.
    const sealed = NEVER_CACHED[name];
    if (sealed) {
      const at = sw.indexOf(`cacheName:"${sealed.cacheName}"`);
      const caching = ['CacheFirst(', 'StaleWhileRevalidate(', 'NetworkFirst(', 'CacheOnly(']
        .map((h) => sw.indexOf(h)).filter((i) => i >= 0);
      if (at === -1 || !/NetworkOnly\(\{\s*$/.test(sw.slice(Math.max(0, at - 40), at))) {
        bad('sw', `no NetworkOnly route (cacheName ${sealed.cacheName}) for ${sealed.path} — it must never be cached`);
      } else if (!sw.includes(sealed.path)) {
        bad('sw', `the ${sealed.cacheName} route does not name ${sealed.path}`);
      } else if (caching.some((i) => i < at)) {
        bad('sw', `a caching route is registered before ${sealed.path}'s NetworkOnly route — it must come first`);
      }
    }

    const workbox = /precacheAndRoute|workbox/.test(sw);
    let precached;
    if (workbox) {
      notes.push('flavour A (VitePWA / Workbox)');
      // The precache manifest may be inlined (default) or in a separate
      // workbox-*.js; generateSW always inlines it into sw.js.
      precached = new Set([...sw.matchAll(/url:"([^"]+)"/g)].map((m) => norm(m[1])));
      if (!/cleanupOutdatedCaches\(\)/.test(sw)) bad('sw', 'no cleanupOutdatedCaches()');
      if (!/skipWaiting\(\)/.test(sw) || !/clientsClaim\(\)/.test(sw)) bad('sw', 'missing skipWaiting()/clientsClaim() (autoUpdate expects both)');

      const nav = sw.indexOf('NavigationRoute(');
      if (nav === -1) {
        notes.push('no navigateFallback');
      } else {
        const fallback = /createHandlerBoundToURL\("([^"]+)"\)/.exec(sw.slice(nav))?.[1];
        if (fallback && !precached.has(norm(fallback))) bad('sw', `navigateFallback ${fallback} is not precached`);
        const close = sw.indexOf('))', nav);
        const deny = regexArrayAfter(sw.slice(nav, close + 400), 'denylist') || [];
        const denied = (p) => deny.some((re) => re.test(p));
        const leaks = MUST_DENY.filter((p) => !denied(p));
        if (leaks.length) bad('sw', `navigateFallback would answer ${leaks.join(', ')} with the SPA shell — add them to navigateFallbackDenylist`);
        const blocked = MUST_ALLOW.filter(denied);
        if (blocked.length) bad('sw', `navigateFallbackDenylist also blocks real routes: ${blocked.join(', ')}`);
      }
      const fontRule = /["']font["']/.test(sw);
      const missingFonts = woff2.filter((f) => !precached.has(f));
      if (missingFonts.length && !fontRule) bad('sw', `${missingFonts.length} .woff2 file(s) are neither precached nor covered by a runtime font rule (add woff2 to globPatterns)`);
      else if (missingFonts.length) notes.push(`${missingFonts.length} woff2 runtime-cached, not precached`);
    } else {
      notes.push('flavour B (hand-rolled sw.js)');
      const buildId = /const BUILD_ID = "([^"]*)";/.exec(sw)?.[1];
      if (!buildId || buildId === 'dev') bad('sw', 'BUILD_ID was not stamped (the swPrecache() plugin did not run)');
      let list = [];
      try { list = JSON.parse(/const PRECACHE_ASSETS = (\[.*\]);/.exec(sw)?.[1] || '[]'); } catch { /* reported below */ }
      const shell = /const ASSETS = \[([^\]]*)/.exec(sw)?.[1] || '';
      precached = new Set([...list.map(norm), ...[...shell.matchAll(/"([^"]+)"/g)].map((m) => norm(m[1]))]);
      if (!list.length) bad('sw', 'PRECACHE_ASSETS is empty');
      if (!/text\/html/.test(sw) || !/cache\.put\(/.test(sw)) bad('sw', 'no text/html guard ahead of cache.put (PWA_STANDARD §1a rule 2)');
      if (/index\.html/.test(sw.replace(/\/\/.*$/gm, ''))) bad('sw', 'hand-rolled SW mentions index.html — it must not answer navigations with the shell');
      const fontCovered = /cache\.put\(/.test(sw); // generic same-origin GET cache
      const missingFonts = woff2.filter((f) => !precached.has(f));
      if (missingFonts.length && !fontCovered) bad('sw', `${missingFonts.length} .woff2 file(s) are not cached at all`);
      else if (missingFonts.length) notes.push(`${missingFonts.length} woff2 runtime-cached, not precached`);
    }
    const unprecached = hashed.filter((h) => !precached.has(h));
    if (unprecached.length) bad('sw', `${unprecached.length} of ${hashed.length} hashed assets are not precached (e.g. ${unprecached[0]}) — too big for maximumFileSizeToCacheInBytes, or outside globPatterns`);
    if (hasOffline && !precached.has('/offline.html')) bad('sw', 'offline.html ships but is not precached');
    notes.push(`${precached.size} precached, ${hashed.length} hashed js/css, ${woff2.length} woff2`);
  }

  // leftovers ───────────────────────────────────────────────────────────────
  for (const t of ['/vite.svg', '/react.svg', '/masked-icon.svg']) {
    if (rels.includes(t)) bad('leftovers', `template icon ${t} is still in the build`);
  }

  return { name, problems, notes };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

function main(argv) {
  const pick = [];
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--app') pick.push(...String(argv[++i] || '').split(','));
    else if (argv[i] === '--json') json = true;
    else if (argv[i] === '--help' || argv[i] === '-h') {
      console.log('usage: node tools/pwa-audit.mjs [--app name[,name]] [--json]');
      return 0;
    } else { console.error(`unknown argument ${argv[i]}`); return 2; }
  }
  const names = pick.length ? pick.filter(Boolean) : Object.keys(APPS);
  const unknown = names.filter((n) => !APPS[n]);
  if (unknown.length) { console.error(`unknown app(s): ${unknown.join(', ')}; known: ${Object.keys(APPS).join(', ')}`); return 2; }

  const results = names.map((n) => auditApp(n, path.join(ROOT, APPS[n], 'dist')));
  const total = results.reduce((s, r) => s + r.problems.length, 0);
  if (json) {
    console.log(JSON.stringify({ problems: total, apps: results }, null, 2));
  } else {
    for (const r of results) {
      console.log(`${r.problems.length ? '✗' : '✓'} ${r.name}${r.notes.length ? `  (${r.notes.join('; ')})` : ''}`);
      for (const p of r.problems) console.log(`    - ${p}`);
    }
    console.log(`\n${total} problem(s) across ${results.length} app(s)`);
  }
  return total ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
