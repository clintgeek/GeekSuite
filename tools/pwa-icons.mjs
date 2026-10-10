#!/usr/bin/env node
// Renders every app's icon masters into its PNG set, deterministically.
//
//   node tools/pwa-icons.mjs                      # all ten apps
//   node tools/pwa-icons.mjs --app bookgeek       # one app (repeatable, or a,b,c)
//   node tools/pwa-icons.mjs --check              # exit 1 if any PNG is stale
//   node tools/pwa-icons.mjs --sheet out.png      # contact sheet of every app
//
// ─── Convention ─────────────────────────────────────────────────────────────
// Each app keeps three hand-written SVG masters in `<publicDir>/icons/`:
//
//   favicon.svg        the browser-tab icon, served as-is. Drawn for 16-32px:
//                      bold shapes, few details, legible on light AND dark
//                      tab strips.
//   icon.svg           the "any" icon: the mark on its own rounded tile.
//                      Served as the manifest's SVG icon, and the source of
//                      icon-192.png / icon-512.png.
//   icon-maskable.svg  full-bleed square background, the mark inside the
//                      central 80% circle (the maskable safe zone; a 512
//                      master keeps everything within r=205 of the centre).
//                      Source of icon-maskable-512.png and of the opaque
//                      apple-touch-icon.png (iOS rounds its own corners).
//
// Outputs, next to the masters (never edit these by hand; re-run this):
//   icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png
//   and `<publicDir>/favicon.ico` (16/32/48, from favicon.svg) for the apps
//   listed with `ico: true` — only those that already shipped one.
//
// Renderer: sharp (librsvg), already installed as a dependency of
// apps/thinggeek/backend — no new dependency. Same inputs + same sharp build
// => the same bytes, so re-running on an unchanged master is a no-op.
// Masters must not use <text> (glyphs would depend on the machine's fonts).

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(ROOT, 'apps/thinggeek/backend/package.json'));

// `bg` flattens the apple-touch icon (it must be opaque) and backs the sheet.
export const APPS = {
  gamegeek: { dir: 'apps/gamegeek/frontend/public', bg: '#0C0A12' },
  bookgeek: { dir: 'apps/bookgeek/web/public', bg: '#0b1222' },
  notegeek: { dir: 'apps/notegeek/frontend/public', bg: '#E9EEE7', ico: true },
  todogeek: { dir: 'apps/todogeek/frontend/public', bg: '#FAF8F5' },
  storygeek: { dir: 'apps/storygeek/frontend/public', bg: '#120d0c' },
  basegeek: { dir: 'apps/basegeek/packages/ui/public', bg: '#0e1012' },
  thinggeek: { dir: 'apps/thinggeek/frontend/public', bg: '#15120F' },
  fitnessgeek: { dir: 'apps/fitnessgeek/frontend/public', bg: '#0F766E' },
  flockgeek: { dir: 'apps/flockgeek/frontend/public', bg: '#0f0f0d' },
  startgeek: { dir: 'apps/startgeek/public', bg: '#0a0d12' },
};

function loadSharp() {
  try {
    return require('sharp');
  } catch {
    console.error('sharp is not installed — run `pnpm install` at the repo root (it comes with apps/thinggeek/backend).');
    process.exit(2);
  }
}

/** The SVG's intrinsic width in user units (width attr, else viewBox). */
function intrinsicWidth(svg) {
  const s = svg.toString('utf8');
  const root = /<svg\b[^>]*>/.exec(s)?.[0] || '';
  const w = /\swidth="([\d.]+)(px)?"/.exec(root)?.[1];
  if (w) return Number(w);
  const vb = /viewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)/.exec(root)?.[1];
  return vb ? Number(vb) : 512;
}

/** Rasterise an SVG straight at `size` px (no downscale blur at 16px). */
async function render(sharp, svg, size, { opaque = null } = {}) {
  const density = (72 * size) / intrinsicWidth(svg);
  let img = sharp(svg, { density }).resize(size, size, { fit: 'fill' });
  if (opaque) img = img.flatten({ background: opaque }).removeAlpha();
  return img.png({ compressionLevel: 9, adaptiveFiltering: false, palette: false }).toBuffer();
}

/** A PNG-payload .ico (Vista+ and every current browser read these). */
function ico(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const dir = Buffer.alloc(16 * pngs.length);
  let offset = 6 + dir.length;
  pngs.forEach(({ size, buf }, i) => {
    const o = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o);
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1);
    dir.writeUInt8(0, o + 2);
    dir.writeUInt8(0, o + 3);
    dir.writeUInt16LE(1, o + 4);
    dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(buf.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += buf.length;
  });
  return Buffer.concat([header, dir, ...pngs.map((p) => p.buf)]);
}

function masters(app) {
  const dir = path.join(ROOT, APPS[app].dir, 'icons');
  const read = (f) => {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) throw new Error(`${app}: missing master ${path.relative(ROOT, p)}`);
    const buf = fs.readFileSync(p);
    if (/<text\b/.test(buf.toString('utf8'))) throw new Error(`${app}: ${f} uses <text>; draw glyphs as paths`);
    return buf;
  };
  return { dir, favicon: read('favicon.svg'), icon: read('icon.svg'), maskable: read('icon-maskable.svg') };
}

/** Every output file for one app, as { path, buf }. */
export async function outputsFor(sharp, app) {
  const m = masters(app);
  const { bg } = APPS[app];
  const out = [
    { path: path.join(m.dir, 'icon-192.png'), buf: await render(sharp, m.icon, 192) },
    { path: path.join(m.dir, 'icon-512.png'), buf: await render(sharp, m.icon, 512) },
    { path: path.join(m.dir, 'icon-maskable-512.png'), buf: await render(sharp, m.maskable, 512, { opaque: bg }) },
    { path: path.join(m.dir, 'apple-touch-icon.png'), buf: await render(sharp, m.maskable, 180, { opaque: bg }) },
  ];
  if (APPS[app].ico) {
    const pngs = [];
    for (const size of [16, 32, 48]) pngs.push({ size, buf: await render(sharp, m.favicon, size) });
    out.push({ path: path.join(ROOT, APPS[app].dir, 'favicon.ico'), buf: ico(pngs) });
  }
  return out;
}

// ─── contact sheet ──────────────────────────────────────────────────────────

const CHROME = { light: '#dee1e6', dark: '#202124' };

async function sheet(sharp, apps, outFile) {
  const cell = 200;
  const cols = [
    ['16px · light tab', async (m) => zoom(sharp, await render(sharp, m.favicon, 16), 16, 4, CHROME.light)],
    ['16px · dark tab', async (m) => zoom(sharp, await render(sharp, m.favicon, 16), 16, 4, CHROME.dark)],
    ['32px · light', async (m) => pad(sharp, await render(sharp, m.favicon, 32), 32, CHROME.light)],
    ['32px · dark', async (m) => pad(sharp, await render(sharp, m.favicon, 32), 32, CHROME.dark)],
    ['180px apple-touch', async (m, bg) => pad(sharp, await render(sharp, m.maskable, 180, { opaque: bg }), 180, '#ffffff')],
    ['192px any', async (m) => pad(sharp, await render(sharp, m.icon, 180), 180, '#9aa0a6')],
    ['maskable · circle', async (m, bg) => circle(sharp, await render(sharp, m.maskable, 180, { opaque: bg }), 180)],
    ['maskable · squircle', async (m, bg) => squircle(sharp, await render(sharp, m.maskable, 180, { opaque: bg }), 180)],
  ];
  const labelW = 150;
  const headH = 40;
  const width = labelW + cols.length * cell;
  const height = headH + apps.length * cell;
  const composites = [];
  const texts = [];
  cols.forEach(([t], c) => texts.push(`<text x="${labelW + c * cell + cell / 2}" y="26" text-anchor="middle">${t}</text>`));
  for (const [r, app] of apps.entries()) {
    const m = masters(app);
    texts.push(`<text x="12" y="${headH + r * cell + cell / 2 + 6}" font-weight="700">${app}</text>`);
    for (const [c, [, fn]] of cols.entries()) {
      const tile = await fn(m, APPS[app].bg);
      composites.push({ input: tile, left: labelW + c * cell + 10, top: headH + r * cell + 10 });
    }
  }
  const base = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="#f4f4f5"/>
    <g font-family="sans-serif" font-size="15" fill="#18181b">${texts.join('')}</g></svg>`);
  await sharp(base).composite(composites).png().toFile(outFile);
}

// Each tile is 180x180 on a backdrop so all columns line up.
async function pad(sharp, png, size, backdrop) {
  const off = Math.round((180 - size) / 2);
  return sharp({ create: { width: 180, height: 180, channels: 4, background: backdrop } })
    .composite([{ input: png, left: off, top: off }]).png().toBuffer();
}
async function zoom(sharp, png, size, factor, backdrop) {
  const big = await sharp(png).resize(size * factor, size * factor, { kernel: 'nearest' }).png().toBuffer();
  return pad(sharp, big, size * factor, backdrop);
}
async function circle(sharp, png, size) {
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/></svg>`);
  const cut = await sharp(png).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  return pad(sharp, cut, size, '#ffffff');
}
async function squircle(sharp, png, size) {
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${size * 0.22}"/></svg>`);
  const cut = await sharp(png).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  return pad(sharp, cut, size, '#202124');
}

// ─── CLI ────────────────────────────────────────────────────────────────────

async function main(argv) {
  const pick = [];
  let check = false;
  let sheetOut = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--app') pick.push(...String(argv[++i] || '').split(','));
    else if (argv[i] === '--check') check = true;
    else if (argv[i] === '--sheet') sheetOut = argv[++i];
    else if (argv[i] === '--help' || argv[i] === '-h') {
      console.log('usage: node tools/pwa-icons.mjs [--app name[,name]] [--check] [--sheet out.png]');
      return 0;
    } else { console.error(`unknown argument ${argv[i]}`); return 2; }
  }
  const apps = pick.length ? pick.filter(Boolean) : Object.keys(APPS);
  const unknown = apps.filter((a) => !APPS[a]);
  if (unknown.length) { console.error(`unknown app(s): ${unknown.join(', ')}`); return 2; }
  const sharp = loadSharp();

  if (sheetOut) {
    await sheet(sharp, apps, path.resolve(sheetOut));
    console.log(`contact sheet → ${path.resolve(sheetOut)}`);
    return 0;
  }

  let stale = 0;
  for (const app of apps) {
    for (const { path: p, buf } of await outputsFor(sharp, app)) {
      const same = fs.existsSync(p) && fs.readFileSync(p).equals(buf);
      const rel = path.relative(ROOT, p);
      if (check) {
        if (!same) { stale++; console.log(`stale  ${rel}`); }
      } else if (!same) {
        fs.writeFileSync(p, buf);
        console.log(`wrote  ${rel} (${buf.length} B)`);
      } else {
        console.log(`same   ${rel}`);
      }
    }
  }
  if (check) console.log(stale ? `${stale} stale icon(s) — run node tools/pwa-icons.mjs` : 'all icons up to date');
  return stale ? 1 : 0;
}

main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (err) => {
  console.error(err.message || err);
  process.exitCode = 1;
});
