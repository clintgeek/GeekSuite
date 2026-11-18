/**
 * Vitest only: rewrite `import { Add, Close as X } from '@mui/icons-material'`
 * into one import per icon (`@mui/icons-material/Add`).
 *
 * The barrel re-exports about 10,000 modules, and vitest evaluates it afresh
 * for every test FILE (each file gets its own module graph): 7.5 seconds a
 * file, measured 2026-11-18, which was most of FitnessGeek's 7-minute suite.
 * The production build tree-shakes the barrel and never sees this plugin.
 *
 * Only the plain named-import form is rewritten; `import * as`, re-exports
 * and dynamic imports are left alone (the suite has none) and simply stay
 * slow.
 */
const BARREL = /import\s*\{([^}]*)\}\s*from\s*(['"])@mui\/icons-material\2\s*;?/g;

export function rewriteIconImports(code) {
  if (!code.includes('@mui/icons-material')) return null;
  let changed = false;
  const out = code.replace(BARREL, (whole, list) => {
    const names = list
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const lines = [];
    for (const spec of names) {
      const m = spec.match(/^([A-Za-z0-9_$]+)(?:\s+as\s+([A-Za-z0-9_$]+))?$/);
      // Anything unexpected: leave the whole statement as it was.
      if (!m || m[1] === 'default') return whole;
      lines.push(`import ${m[2] || m[1]} from '@mui/icons-material/${m[1]}';`);
    }
    changed = true;
    // Keep the line count, so stack traces and coverage still point home.
    const pad = (whole.match(/\n/g) || []).length;
    return lines.join(' ') + '\n'.repeat(pad);
  });
  return changed ? out : null;
}

export default function muiIconsDeepImports() {
  return {
    name: 'geeksuite:mui-icons-deep-imports',
    enforce: 'pre',
    transform(code, id) {
      if (id.includes('/node_modules/') || !/\.[cm]?[jt]sx?(\?|$)/.test(id)) return null;
      const out = rewriteIconImports(code);
      return out ? { code: out, map: null } : null;
    },
  };
}
