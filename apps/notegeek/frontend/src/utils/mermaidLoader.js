/**
 * mermaidLoader.js — Mermaid, loaded only when a diagram is about to be drawn
 * (DOCS/HANDWRITING.md "Turn into a diagram", DOCS/CONTEXT.md §27).
 *
 * Mermaid is megabytes and most notes never show a diagram, so it is a
 * dynamic `import('mermaid')`: it never enters the main chunk, and the
 * service worker leaves its chunks out of the precache (vite.config.js).
 *
 * Settings, on every render:
 *   - `securityLevel: 'strict'`: labels are text, `click` and links do nothing;
 *   - `htmlLabels: false`: labels are SVG <text>, so the drawing is pure SVG
 *     (no <foreignObject> HTML), prints, and has nothing for a stored note
 *     to inject into;
 *   - the colours come from the app's palette for the mode (light, dark),
 *     on Mermaid's `base` theme. Mermaid's settings are global, so renders are
 *     queued one at a time and each sets the theme it needs first: a light
 *     print copy and a dark screen copy can be drawn on the same page.
 */
import { graphite } from '../theme/graphite';

const FONT = "'Spline Sans Variable', 'Spline Sans', system-ui, sans-serif";

/** Mermaid's settings for a mode ('light' | 'dark'). Pure; tests read it. */
export function mermaidConfig(mode = 'light') {
  const dark = mode === 'dark';
  const p = graphite[dark ? 'dark' : 'light'];
  return {
    startOnLoad: false,
    securityLevel: 'strict',
    htmlLabels: false,
    // A failed render throws; it must not also draw Mermaid's error picture.
    suppressErrorRendering: true,
    theme: 'base',
    fontFamily: FONT,
    flowchart: { htmlLabels: false, useMaxWidth: false, curve: 'basis' },
    themeVariables: {
      darkMode: dark,
      fontFamily: FONT,
      fontSize: '15px',
      background: p.sheet,
      // Nodes: the sheet with an ink outline; words in ink.
      primaryColor: dark ? p.paper : p.sheet,
      primaryTextColor: p.ink,
      primaryBorderColor: p.lead,
      nodeBorder: p.lead,
      nodeTextColor: p.ink,
      textColor: p.ink,
      // Arrows and their labels.
      lineColor: p.ink2,
      edgeLabelBackground: p.sheet,
      // Subgraphs.
      secondaryColor: p.paper,
      tertiaryColor: p.desk,
      clusterBkg: p.desk,
      clusterBorder: p.border,
      titleColor: p.ink,
    },
  };
}

let loading = null;
let queue = Promise.resolve();
let themed = null;
let seq = 0;

/** The Mermaid module, imported and initialised once. Retried after a failed import. */
export function loadMermaid() {
  if (!loading) {
    loading = import('mermaid')
      .then((mod) => {
        const mermaid = mod.default || mod;
        mermaid.initialize(mermaidConfig('light'));
        themed = 'light';
        return mermaid;
      })
      .catch((err) => {
        loading = null;
        throw err;
      });
  }
  return loading;
}

/** Run `job(mermaid)` after every earlier one, with the theme for `mode` set. */
function queued(mode, job) {
  const run = async () => {
    const mermaid = await loadMermaid();
    if (mode && themed !== mode) {
      mermaid.initialize(mermaidConfig(mode));
      themed = mode;
    }
    return job(mermaid);
  };
  const result = queue.then(run, run);
  queue = result.catch(() => undefined);
  return result;
}

/**
 * Draw `source` as SVG markup.
 * @param {string} source
 * @param {{ mode?: 'light'|'dark' }} [opts]
 * @returns {Promise<string>}  the SVG; rejects with Mermaid's error
 */
export function renderMermaid(source, { mode = 'light' } = {}) {
  return queued(mode, async (mermaid) => {
    seq += 1;
    const { svg } = await mermaid.render(`ng-mermaid-${seq}`, String(source ?? ''));
    return svg;
  });
}

/**
 * Mermaid's own check of `source`, the real validation of a model's answer.
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
 */
export function parseMermaid(source) {
  return queued(null, async (mermaid) => {
    try {
      await mermaid.parse(String(source ?? ''));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: mermaidErrorText(err) };
    }
  });
}

/** Mermaid's error as one short paragraph. */
export function mermaidErrorText(err) {
  const raw = String(err?.message || err?.str || err || 'unknown error');
  return raw.replace(/\s+/g, ' ').trim().slice(0, 300);
}

/** Tests only: forget the loaded module and the queue. */
export function _resetMermaidLoader() {
  loading = null;
  queue = Promise.resolve();
  themed = null;
  seq = 0;
}
