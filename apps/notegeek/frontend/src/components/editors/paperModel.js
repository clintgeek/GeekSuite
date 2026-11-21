/**
 * Sketch paper: a colour and a ruling, chosen from the drawing toolbar
 * (Chef, 2026-11-14: "the background is a bit bright").
 *
 * Kept per sketch in tldraw's document meta (`paperColor`, `paperPattern`),
 * so it saves with the note. The last pick is also remembered on this device
 * and used by any sketch that never chose. Every paper but "Match theme" is
 * light and puts tldraw in its light scheme, so the default black ink stays
 * black.
 *
 * A sketch may also carry a page TEMPLATE (DOCS/TEMPLATES_SPEC.md P1–P7): a
 * printed layout from the suite's shared set (`@geeksuite/ui`, the same one
 * GeekDay's day page uses), kept in the same document meta under
 * `PAPER_TEMPLATE_META_KEY`. Per sketch only — there is no device default,
 * so a sketch never has a template unless someone chose one for it.
 *
 * Pure helpers only; the components are in Paper.jsx.
 */
import { PAPER_PAGE, PAPER_RULE, PAPER_TEMPLATE_META_KEY, PAPER_TEMPLATE_NONE, isPaperTemplate } from '@geeksuite/ui';

export const PAPER_COLORS = [
    // Today's look: tldraw's own ground, light or dark with the app.
    { id: 'auto', label: 'Match theme', background: null, line: 'rgba(128, 128, 128, 0.28)' },
    { id: 'white', label: 'White', background: '#ffffff', line: 'rgba(70, 110, 170, 0.24)' },
    { id: 'warm', label: 'Warm paper', background: '#f4eedf', line: 'rgba(130, 95, 50, 0.22)' },
    { id: 'grey', label: 'Soft grey', background: '#e5e7ea', line: 'rgba(60, 70, 85, 0.20)' },
    { id: 'green', label: 'Engineering green', background: '#e1ebd6', line: 'rgba(60, 120, 50, 0.30)' },
];

export const PAPER_PATTERNS = [
    { id: 'plain', label: 'Plain' },
    { id: 'lined', label: 'Lined' },
    { id: 'graph', label: 'Graph' },
    { id: 'dots', label: 'Dot grid' },
];

// Spacing in page units, so the ruling zooms with the writing. Lined is
// roughly college-ruled at the default pen size.
export const SPACING = { lined: 32, graph: 16, graphMajor: 80, dots: 24 };
// Below this many screen px between lines, the ruling is left out
// (zoomed far out it would be a grey wash).
const MIN_SCREEN_GAP = 6;

const STORAGE_KEY = 'notegeek:sketchPaper';
const colorIds = new Set(PAPER_COLORS.map((c) => c.id));
const patternIds = new Set(PAPER_PATTERNS.map((p) => p.id));

/** This device's last pick, or Match theme / Plain. */
export function readDevicePaper(storage = globalThis.localStorage) {
    try {
        const saved = JSON.parse(storage?.getItem(STORAGE_KEY) || '{}');
        return {
            color: colorIds.has(saved.color) ? saved.color : 'auto',
            pattern: patternIds.has(saved.pattern) ? saved.pattern : 'plain',
        };
    } catch {
        return { color: 'auto', pattern: 'plain' };
    }
}

export function writeDevicePaper(paper, storage = globalThis.localStorage) {
    try {
        storage?.setItem(STORAGE_KEY, JSON.stringify(paper));
    } catch {
        // private mode / storage full: the sketch still keeps its own paper
    }
}

/** The sketch's own paper, falling back to the device's, per field. */
export function paperFromMeta(meta, devicePaper) {
    return {
        color: colorIds.has(meta?.paperColor) ? meta.paperColor : devicePaper.color,
        pattern: patternIds.has(meta?.paperPattern) ? meta.paperPattern : devicePaper.pattern,
    };
}

/**
 * What to paint: the ground colour (null = tldraw's own), tldraw's colour
 * scheme, and the ruling's colour.
 */
export function resolvePaper({ color, pattern }, themeMode) {
    const c = PAPER_COLORS.find((p) => p.id === color) || PAPER_COLORS[0];
    return {
        background: c.background,
        colorScheme: c.background ? 'light' : (themeMode === 'dark' ? 'dark' : 'light'),
        line: c.line,
        pattern: patternIds.has(pattern) ? pattern : 'plain',
    };
}

/** Stronger copy of an rgba() line colour, for graph paper's major lines. */
function stronger(rgba) {
    return rgba.replace(/([\d.]+)\)$/, (_, a) => `${Math.min(1, Number(a) * 1.8).toFixed(2)})`);
}

const mod = (n, m) => ((n % m) + m) % m;

/**
 * CSS for the ruling, in screen space, from tldraw's camera ({x, y, z}: a page
 * point p is drawn at (p + camera) * z). Empty for plain paper.
 */
export function rulingStyle(pattern, line, camera) {
    const z = camera?.z || 1;
    const ox = (camera?.x || 0) * z;
    const oy = (camera?.y || 0) * z;
    const gap = (units) => units * z;
    const at = (size) => `${mod(ox, size)}px ${mod(oy, size)}px`;

    if (pattern === 'lined') {
        const s = gap(SPACING.lined);
        if (s < MIN_SCREEN_GAP) return {};
        return {
            backgroundImage: `linear-gradient(to bottom, ${line} 1px, transparent 1px)`,
            backgroundSize: `100% ${s}px`,
            backgroundPosition: at(s),
        };
    }
    if (pattern === 'graph') {
        const s = gap(SPACING.graph);
        const S = gap(SPACING.graphMajor);
        if (S < MIN_SCREEN_GAP) return {};
        const major = stronger(line);
        const layers = [
            [`linear-gradient(to right, ${major} 1px, transparent 1px)`, S],
            [`linear-gradient(to bottom, ${major} 1px, transparent 1px)`, S],
        ];
        if (s >= MIN_SCREEN_GAP) {
            layers.push([`linear-gradient(to right, ${line} 1px, transparent 1px)`, s]);
            layers.push([`linear-gradient(to bottom, ${line} 1px, transparent 1px)`, s]);
        }
        return {
            backgroundImage: layers.map(([img]) => img).join(', '),
            backgroundSize: layers.map(([, size]) => `${size}px ${size}px`).join(', '),
            backgroundPosition: layers.map(([, size]) => at(size)).join(', '),
        };
    }
    if (pattern === 'dots') {
        const s = gap(SPACING.dots);
        if (s < MIN_SCREEN_GAP) return {};
        const dot = stronger(line);
        return {
            backgroundImage: `radial-gradient(circle at 1px 1px, ${dot} 1.2px, transparent 1.6px)`,
            backgroundSize: `${s}px ${s}px`,
            backgroundPosition: at(s),
        };
    }
    return {};
}

// ── Page templates ───────────────────────────────────────────────────────

/**
 * The sketch's template id, or null. Null for a sketch that never chose, for
 * "none", and for an id this build does not know (P7: a newer or removed
 * template opens as a plain page; the stored value is never touched here).
 */
export function templateFromMeta(meta) {
    const id = meta?.[PAPER_TEMPLATE_META_KEY];
    return isPaperTemplate(id) ? id : null;
}

/**
 * The document meta after choosing `id` (a template id, or null for None),
 * or null when there is nothing to write. Every other key — paper colour,
 * ruling, anything another app keeps there — is carried over as it is.
 *
 * None is written as PAPER_TEMPLATE_NONE, not by deleting the key: GeekDay
 * reads a missing key as "never chose" and may apply its own default.
 * None on a sketch with no KNOWN template is not a change: nothing is
 * written, so an untouched sketch stays untouched and an unknown id (P7)
 * survives someone opening the menu.
 */
export function metaWithTemplate(meta, id) {
    const current = templateFromMeta(meta);
    const next = isPaperTemplate(id) ? id : null;
    if (next === current) return null;
    return { ...(meta || {}), [PAPER_TEMPLATE_META_KEY]: next || PAPER_TEMPLATE_NONE };
}

/** Printed words on a light paper / on tldraw's dark ground ("Match theme" at night). */
export const TEMPLATE_INK = { light: '#595d66', dark: '#a4a9b3' };

/**
 * The template's colours for a resolved paper (`resolvePaper`): its rules in
 * the paper's own line colour, a step stronger than the ruling (they are a
 * layout, not a texture), and its words in a grey that reads on every paper.
 * NoteGeek has no second accent, so the accent is the ink.
 */
export function templateColors(look) {
    const ink = look?.colorScheme === 'dark' ? TEMPLATE_INK.dark : TEMPLATE_INK.light;
    return { ink, line: stronger(look?.line || PAPER_COLORS[0].line), accent: ink };
}

/**
 * Where the template's sheet is on screen, from tldraw's camera: its top-left
 * at page (0, 0), PAPER_PAGE wide and tall, moving and scaling like the
 * ruling. Null when zoomed so far out that it would be a grey smudge.
 */
export function templateSheetBox(camera) {
    const z = camera?.z || 1;
    if (PAPER_RULE * z < MIN_SCREEN_GAP) return null;
    return {
        left: (camera?.x || 0) * z,
        top: (camera?.y || 0) * z,
        width: PAPER_PAGE.width * z,
        height: PAPER_PAGE.height * z,
    };
}

/**
 * The page box to bring into view so the sheet's full width shows, from its
 * top: as much of the sheet's height as the viewport's shape allows.
 */
export function templateViewBox(viewport) {
    const w = viewport?.w > 0 ? viewport.w : PAPER_PAGE.width;
    const h = viewport?.h > 0 ? viewport.h : PAPER_PAGE.height;
    const tall = Math.min(PAPER_PAGE.height, Math.max(PAPER_RULE * 4, (PAPER_PAGE.width * h) / w));
    return { x: 0, y: 0, w: PAPER_PAGE.width, h: tall };
}
