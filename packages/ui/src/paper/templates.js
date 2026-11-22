/**
 * Page templates: the printed layout behind handwriting
 * (DOCS/TEMPLATES_SPEC.md P1–P7). One set, shared by GeekDay's day page and
 * NoteGeek's sketches, so a page looks the same in both.
 *
 * Pure strings: no React, no MUI, no DOM. A template is an SVG of one sheet
 * (PAPER_PAGE, in page units) with a transparent ground; the app paints the
 * paper and draws this above it and below the ink. It is decoration: callers
 * render it `aria-hidden` / with an empty alt, and it is never a shape.
 *
 * Which template a page uses is stored in the sketch's tldraw DOCUMENT META
 * under PAPER_TEMPLATE_META_KEY, beside NoteGeek's `paperColor` and
 * `paperPattern`. An id that is not in PAPER_TEMPLATES (a newer or removed
 * template, or PAPER_TEMPLATE_NONE) draws nothing and is left as it is.
 *
 * Writing lines sit on the 48-unit ruling GeekDay's plain page uses (y = 48k),
 * so ink keeps its line when a page runs on past the first sheet. The one
 * exception is the schedule, see `schedule()`.
 */

/** One printed sheet, in page units. */
export const PAPER_PAGE = { width: 1000, height: 1400 };

/** The tldraw document-meta key that holds a page's template id. */
export const PAPER_TEMPLATE_META_KEY = 'paperTemplate';

/**
 * Stored when the writer chose "no template" on purpose (as opposed to never
 * choosing). Not a template: `isPaperTemplate('none')` is false and it draws
 * nothing, like any id this list does not know.
 */
export const PAPER_TEMPLATE_NONE = 'none';

/**
 * `tiles`: the pattern has no top or bottom, so an app with a page taller
 * than one sheet may ask for it at that height (`{ height }`) instead of
 * stopping after the first sheet.
 */
export const PAPER_TEMPLATES = [
  { id: 'schedule', label: 'Schedule', description: 'The hours from 6 AM to 9 PM down the left, notes on the right', tiles: false },
  { id: 'top3', label: 'Top three', description: 'Three priorities to tick off, then ruled notes', tiles: false },
  { id: 'meeting', label: 'Meeting', description: 'Attendees and agenda, notes, and a column of actions to tick', tiles: false },
  { id: 'oneonone', label: '1:1', description: 'Their topics and mine at the head, notes, and a column of actions to tick', tiles: false },
  { id: 'cornell', label: 'Cornell', description: 'A cue column, notes, and a summary at the foot', tiles: false },
  { id: 'dots', label: 'Dot grid', description: 'Dots every line, for lists, sketches and tables', tiles: true },
  { id: 'grid', label: 'Grid', description: 'Squares with a heavier line every fifth', tiles: true },
];

/** The ruling every template (but the schedule) writes on, in page units. */
export const PAPER_RULE = 48;

const W = PAPER_PAGE.width;
const H = PAPER_PAGE.height;
const RULE = PAPER_RULE;
/** Left and right margin of the printed area. */
const L = 40;
const R = W - L;

// Mid greys that read on light and on dark paper alike.
const DEFAULT_COLORS = { ink: '#7b808a', line: 'rgba(128, 128, 128, 0.45)', accent: '#7b808a' };

const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
/** Printed words: 24 page units, so 12 CSS px at half zoom. */
const LABEL_SIZE = 24;

const esc = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/** A colour is used only if it is a plain string a CSS colour could be. */
const color = (value, fallback) => (typeof value === 'string' && value.trim() && !/[<>"]/.test(value) ? value.trim() : fallback);

const n = (value) => String(Math.round(value * 100) / 100);
const hline = (y, x1 = L, x2 = R) => `M${n(x1)} ${n(y)}H${n(x2)}`;
const vline = (x, y1, y2) => `M${n(x)} ${n(y1)}V${n(y2)}`;
const box = (x, y, size) => `M${n(x)} ${n(y)}h${n(size)}v${n(size)}h${n(-size)}z`;
const range = (from, to, step) => {
  const out = [];
  for (let v = from; v <= to + 1e-6; v += step) out.push(v);
  return out;
};

/**
 * Lines are hairlines: `non-scaling-stroke` keeps them one or two screen
 * pixels wide at any zoom, so they stay crisp zoomed out and never grow into
 * bars zoomed in.
 */
const stroke = (d, paint, width = 1, extra = '') => (
  d ? `<path d="${d}" fill="none" stroke="${esc(paint)}" stroke-width="${width}" vector-effect="non-scaling-stroke"${extra}/>` : ''
);

const label = (text, x, y, paint, { anchor = 'start', size = LABEL_SIZE, weight = 600, spacing = 1.5 } = {}) => (
  `<text x="${n(x)}" y="${n(y)}" fill="${esc(paint)}" font-size="${size}" font-weight="${weight}" letter-spacing="${spacing}" text-anchor="${anchor}">${esc(text)}</text>`
);

/**
 * The day's hours, 6 AM to 9 PM, one hour per two lines with a light
 * half-hour line, and notes on the right.
 *
 * Fifteen hours at two 48-unit rules each is 1440 units: 40 more than the
 * sheet. So this sheet alone is ruled at 44, which fits the whole day with
 * its heading and keeps "an hour is two lines". Everything on the sheet
 * (hours and notes) shares that ruling.
 */
function schedule({ ink, line, accent }) {
  const step = 44;
  const top = 56;
  const hours = range(6, 21, 1);
  const hourY = (h) => top + (h - 6) * step * 2;
  const bottom = hourY(21);
  const gutter = 148; // hour labels end here
  const split = 620; // hours | notes
  const fmt = (h) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;

  const hourLines = hours.filter((h) => h !== 12).map((h) => hline(hourY(h), gutter + 12, split - 20)).join('');
  const halfLines = hours.slice(0, -1).map((h) => hline(hourY(h) + step, gutter + 12, split - 20)).join('');
  const noteLines = range(top + step * 2, bottom, step).map((y) => hline(y, split + 20, R)).join('');
  const labels = hours.map((h) => label(fmt(h), gutter, hourY(h) + 8, h === 12 ? accent : ink, { anchor: 'end', weight: h === 12 ? 700 : 500, spacing: 0.5 })).join('');

  return [
    stroke(halfLines, line, 1, ' stroke-dasharray="2 5"'),
    stroke(hourLines, line),
    stroke(hline(hourY(12), gutter + 12, split - 20), accent, 1.5, ' stroke-opacity="0.7"'),
    stroke(noteLines, line),
    stroke(vline(split, top - 28, bottom), line, 1.5),
    label('NOTES', split + 20, top + 8, ink),
    labels,
  ].join('');
}

/** "Top three": three numbered lines with a tick box each, then ruled notes. */
function top3({ ink, line, accent }) {
  const rows = [3, 5, 7].map((k) => k * RULE); // two rules each: room to write large
  const tick = 36;
  const notesFrom = 10 * RULE;
  return [
    label('TOP THREE', L, 40, ink),
    stroke(rows.map((y) => hline(y, L + 56, R - tick - 20)).join(''), line, 1.5),
    stroke(rows.map((y) => box(R - tick, y - tick - 6, tick)).join(''), line, 1.5),
    rows.map((y, i) => label(String(i + 1), L + 4, y - 10, accent, { size: 44, weight: 700, spacing: 0 })).join(''),
    label('NOTES', L, notesFrom - RULE - 12, ink),
    stroke(range(notesFrom, H, RULE).map((y) => hline(y)).join(''), line),
  ].join('');
}

/** Attendees and agenda in a band at the head; notes; actions with a tick box per line. */
function meeting({ ink, line, accent }) {
  const band = 5 * RULE; // foot of the header band
  const mid = W / 2;
  const split = 660; // notes | actions
  const tick = 26;
  const headLines = [2, 3, 4].map((k) => k * RULE);
  const bodyLines = range(band + 2 * RULE, H, RULE);
  return [
    label('ATTENDEES', L, 40, ink),
    label('AGENDA', mid + 20, 40, ink),
    stroke(headLines.map((y) => hline(y, L, mid - 20) + hline(y, mid + 20, R)).join(''), line),
    stroke(hline(band), line, 2),
    label('NOTES', L, band + 40, ink),
    label('ACTIONS', split + 20, band + 40, accent),
    stroke(vline(split, band, H - 8), line, 1.5),
    stroke(bodyLines.map((y) => hline(y, L, split - 20) + hline(y, split + 20 + tick + 12, R)).join(''), line),
    stroke(bodyLines.map((y) => box(split + 20, y - tick - 4, tick)).join(''), line, 1.5),
  ].join('');
}

/** A 1:1: their topics and mine in a band at the head; notes; actions with a tick box per line. */
function oneonone({ ink, line, accent }) {
  const band = 7 * RULE; // foot of the topics band
  const mid = W / 2;
  const split = 660; // notes | actions
  const tick = 26;
  const headLines = [2, 3, 4, 5, 6].map((k) => k * RULE);
  const bodyLines = range(band + 2 * RULE, H, RULE);
  return [
    label('THEIR TOPICS', L, 40, ink),
    label('MY TOPICS', mid + 20, 40, ink),
    stroke(headLines.map((y) => hline(y, L, mid - 20) + hline(y, mid + 20, R)).join(''), line),
    stroke(hline(band), line, 2),
    label('NOTES', L, band + 40, ink),
    label('ACTIONS', split + 20, band + 40, accent),
    stroke(vline(split, band, H - 8), line, 1.5),
    stroke(bodyLines.map((y) => hline(y, L, split - 20) + hline(y, split + 20 + tick + 12, R)).join(''), line),
    stroke(bodyLines.map((y) => box(split + 20, y - tick - 4, tick)).join(''), line, 1.5),
  ].join('');
}

/** Cornell notes: cues on the left, notes on the right, a summary at the foot. */
function cornell({ ink, line, accent }) {
  const head = 2 * RULE;
  const foot = 23 * RULE; // 1104: the summary starts here
  const cue = 300;
  return [
    label('CUES', L, head - 20, ink),
    label('NOTES', cue + 24, head - 20, ink),
    stroke(hline(head), line, 2),
    stroke(vline(cue, head, foot), accent, 1.5, ' stroke-opacity="0.7"'),
    stroke(range(head + RULE, foot - RULE, RULE).map((y) => hline(y, cue + 24, R)).join(''), line),
    stroke(hline(foot), line, 2),
    label('SUMMARY', L, foot + 36, ink),
    stroke(range(foot + 2 * RULE, H, RULE).map((y) => hline(y)).join(''), line),
  ].join('');
}

// The square patterns are centred: 20 squares of 48 leave 20 units either side.
const GRID_LEFT = (W - Math.floor(W / RULE) * RULE) / 2;

/** A dot at every crossing of the 48-unit ruling. */
function dots({ line }, height) {
  // Zero-length dashes with round caps: one dot every 48 units along each row.
  const rows = range(RULE, height, RULE).map((y) => hline(y, GRID_LEFT, W - GRID_LEFT + 1)).join('');
  return rows
    ? `<path d="${rows}" fill="none" stroke="${esc(line)}" stroke-width="6" stroke-linecap="round" stroke-dasharray="0 ${RULE}"/>`
    : '';
}

/** Squares on the 48-unit ruling, with a heavier line every fifth. */
function grid({ line }, height) {
  const major = RULE * 5;
  const xs = range(GRID_LEFT, W - GRID_LEFT, RULE);
  const ys = range(RULE, height, RULE);
  const isMajorX = (x) => Math.round(x - GRID_LEFT) % major === 0;
  const isMajorY = (y) => Math.round(y) % major === 0;
  const lines = (major5) => (
    xs.filter((x) => isMajorX(x) === major5).map((x) => vline(x, 0, height)).join('')
    + ys.filter((y) => isMajorY(y) === major5).map((y) => hline(y, GRID_LEFT, W - GRID_LEFT)).join('')
  );
  return stroke(lines(false), line, 1, ' stroke-opacity="0.7"') + stroke(lines(true), line, 1.75);
}

const DRAW = { schedule, top3, meeting, oneonone, cornell, dots, grid };

const byId = new Map(PAPER_TEMPLATES.map((t) => [t.id, t]));

/** Is `id` one of the templates this library can draw? */
export function isPaperTemplate(id) {
  return typeof id === 'string' && byId.has(id);
}

/**
 * One sheet of a template as a complete SVG document, or null for an id this
 * library does not know.
 *
 * @param {string} id
 * @param {object} [colors]
 * @param {string} [colors.ink]     printed words
 * @param {string} [colors.line]    rules and boxes
 * @param {string} [colors.accent]  the one accent (GeekDay's ribbon)
 * @param {number} [colors.height]  only for templates that tile (`tiles`):
 *   draw the pattern this many page units tall instead of one sheet
 * @param {string} [colors.ground]  paint the sheet's own paper in this colour
 *   (with a hairline edge) instead of leaving the ground transparent
 * @returns {string|null}
 */
export function paperTemplateSvg(id, { ink, line, accent, height, ground } = {}) {
  if (!isPaperTemplate(id)) return null;
  const colors = {
    ink: color(ink, DEFAULT_COLORS.ink),
    line: color(line, DEFAULT_COLORS.line),
    accent: color(accent, color(ink, DEFAULT_COLORS.accent)),
  };
  const tall = byId.get(id).tiles && Number.isFinite(height) && height > H ? Math.ceil(height) : H;
  // An opaque sheet (paper/sheet.js): its own paper, and a hairline edge so
  // a white sheet still has an outline on white paper.
  const paper = color(ground, null);
  const sheet = paper
    ? `<rect width="${W}" height="${tall}" fill="${esc(paper)}"/>`
      + `<rect x="0.5" y="0.5" width="${W - 1}" height="${tall - 1}" fill="none" stroke="${esc(colors.line)}" stroke-width="1" vector-effect="non-scaling-stroke"/>`
    : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${tall}" width="${W}" height="${tall}" font-family="${esc(FONT)}">`
    + sheet
    + DRAW[id](colors, tall)
    + '</svg>'
  );
}

export const PAPER_TEMPLATE_DATA_URI_PREFIX = 'data:image/svg+xml;charset=utf-8,';

/** The same SVG as a data URI for an `<img src>` or a CSS `url()`, or null. */
export function paperTemplateDataUri(id, colors) {
  const svg = paperTemplateSvg(id, colors);
  if (svg === null) return null;
  // encodeURIComponent leaves ' ( ) alone; they would end a CSS url('…').
  const body = encodeURIComponent(svg).replace(/['()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return PAPER_TEMPLATE_DATA_URI_PREFIX + body;
}
