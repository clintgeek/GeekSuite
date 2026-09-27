// Generates photo-page-1.jpg and photo-page-2-exif6.jpg, the notebook-page
// photos the "Photo of a page" scenes upload (HANDWRITING.md §3). Small, real
// JPEGs; the second is stored on its side with EXIF orientation 6, as a phone
// saves a portrait shot. Run from the repo root (uses thinggeek's sharp):
//   node tools/mobile-harness/apps/notegeek/make-photo-fixtures.cjs tools/mobile-harness/apps/notegeek
const sharp = require(require('path').resolve(__dirname, '../../../../apps/thinggeek/backend/node_modules/sharp'));
const out = process.argv[2];
const W = 1200, H = 1600;
function page(lines, header) {
  const ruled = Array.from({ length: 30 }, (_, i) => `<line x1="0" y1="${200 + i * 46}" x2="${W}" y2="${200 + i * 46}" stroke="#9db8d9" stroke-width="2"/>`).join('');
  const holes = [260, 800, 1340].map((y) => `<circle cx="46" cy="${y}" r="22" fill="#5b5146"/>`).join('');
  const ink = lines.map((t, i) => `<text x="170" y="${238 + i * 92}" font-family="Z003" font-size="64" fill="#1d2b5c">${t}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><radialGradient id="g" cx="45%" cy="40%" r="80%"><stop offset="0" stop-color="#fbf8f0"/><stop offset="1" stop-color="#d8d1c2"/></radialGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>
    ${ruled}
    <line x1="140" y1="0" x2="140" y2="${H}" stroke="#e39a9a" stroke-width="3"/>
    ${holes}
    <text x="170" y="120" font-family="DejaVu Sans" font-size="30" fill="#8b8f99" letter-spacing="3">${header}</text>
    ${ink}
    <rect x="${W - 90}" y="0" width="90" height="${H}" fill="#3a332b" opacity="0.35"/>
  </svg>`;
}
(async () => {
  const p1 = page(['Kitchen plan', '- tiles: grey, matte', '- lights over the island', '-&gt; ask Heather re: budget', '[ ] measure the window', '[x] call the plumber'], 'DATE ________   No. ______');
  const p2 = page(['Page two', 'order: 40 tiles + 10%', 'grout colour: ash', 'ring Mike on Tues', '- [?] the extractor'], 'DATE ________   No. ______');
  await sharp(Buffer.from(p1)).rotate(1.5, { background: '#3a332b' }).resize(1200).jpeg({ quality: 72, mozjpeg: true }).toFile(`${out}/photo-page-1.jpg`);
  // Stored on its side, with EXIF orientation 6 ("turn 90° clockwise to view"),
  // the way a phone saves a portrait shot. Upright it is portrait.
  await sharp(Buffer.from(p2)).rotate(-90).jpeg({ quality: 72, mozjpeg: true }).withMetadata({ orientation: 6 }).toFile(`${out}/photo-page-2-exif6.jpg`);
  for (const f of ['photo-page-1.jpg', 'photo-page-2-exif6.jpg']) {
    const m = await sharp(`${out}/${f}`).metadata();
    console.log(f, m.width, m.height, 'orientation', m.orientation, m.size || '', require('fs').statSync(`${out}/${f}`).size, 'bytes');
  }
})();
