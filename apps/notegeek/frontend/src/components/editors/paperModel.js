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
 * A sketch may also have a TEMPLATE (DOCS/TEMPLATES_SPEC.md T1–T8). That is
 * not paper and is not kept here: it is a white sheet printed into the
 * drawing as a locked shape (`@geeksuite/ui`, paper/sheet.js). Paper colour
 * and lines never change it, and it never changes them.
 *
 * Pure helpers only; the components are in Paper.jsx.
 */
import { PAPER_RULE } from '@geeksuite/ui';

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
 * scheme, and the ruling's colour. `sheet`: the sketch has a template sheet.
 */
export function resolvePaper({ color, pattern }, themeMode, { sheet = false } = {}) {
    const c = PAPER_COLORS.find((p) => p.id === color) || PAPER_COLORS[0];
    return {
        background: c.background,
        // A template sheet is white whatever the theme, and tldraw's dark
        // scheme draws "black" ink near-white: it would vanish on the sheet.
        // So a sketch with a sheet is always in the light scheme, as it is
        // on every paper but "Match theme".
        colorScheme: c.background || sheet ? 'light' : (themeMode === 'dark' ? 'dark' : 'light'),
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

// ── Template sheets ──────────────────────────────────────────────────────
// A template is not paper. It is a white sheet printed into the drawing as
// one locked shape (`@geeksuite/ui` paper/sheet.js; DOCS/TEMPLATES_SPEC.md
// T1–T8). The paper above is untouched by it and carries on around it. All
// this file knows about a sheet is where to put it and how to look at it.

/**
 * The page box to bring into view so a sheet's full width shows, from its
 * top: as much of its height as the viewport's shape allows.
 * @param {{x:number,y:number,w:number,h:number}} sheet  the sheet's page bounds
 */
export function sheetViewBox(sheet, viewport) {
    const w = viewport?.w > 0 ? viewport.w : sheet.w;
    const h = viewport?.h > 0 ? viewport.h : sheet.h;
    const tall = Math.min(sheet.h, Math.max(PAPER_RULE * 4, (sheet.w * h) / w));
    return { x: sheet.x, y: sheet.y, w: sheet.w, h: tall };
}

/**
 * Where a new sheet goes: page (0, 0) on a sketch with nothing drawn; on one
 * that has ink, the top-left of what is on screen, so it lands where the
 * writer is looking (and under what they wrote there).
 */
export function sheetPlacement({ hasInk, viewport }) {
    if (!hasInk || !viewport) return { x: 0, y: 0 };
    return { x: Math.round(viewport.x || 0), y: Math.round(viewport.y || 0) };
}
