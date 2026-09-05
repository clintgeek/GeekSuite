// The axe-core pass — the fourth probe category (`a11y`), report-only by default.
//
// Why a separate module: axe is a 580KB script that has to be *injected into
// the page* before the probe evaluates, which is a different shape from the
// three grammar rules (pure computed-style reads). Everything after the
// injection lives in `probe.mjs` alongside the others so the a11y findings
// share `describe`/`selectorHint` with tap-target and friends — one selector
// vocabulary for the whole harness.
//
// Configuration (see `AXE_OPTIONS`):
//   runOnly      wcag2a + wcag2aa. Not the best-practice tags: those are
//                opinions, and a gate that reports opinions gets ignored.
//   color-contrast is left ON deliberately. `packages/ui` carries its own
//                contrast ratchet (THE_UI_UNIFICATION_PLAN), so a
//                disagreement between axe and the ratchet is a finding worth
//                reading, not noise worth muting.
//   resultTypes  violations only — we never report passes/incomplete, and
//                capping the other result types keeps the payload small.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

export const AXE_OPTIONS = {
  runOnly: ['wcag2a', 'wcag2aa'],
  resultTypes: ['violations'],
  rules: { 'color-contrast': { enabled: true } },
};

let cachedPath = null;

// `axe.min.js` from the tool's own devDependency. `require.resolve` follows
// pnpm's symlink farm, so this works from a worktree or a hoisted install;
// the literal path is the belt-and-braces fallback.
export function axeScriptPath() {
  if (cachedPath) return cachedPath;
  const candidates = [];
  try {
    candidates.push(path.join(path.dirname(require.resolve('axe-core')), 'axe.min.js'));
  } catch {
    /* not resolvable from here — try the literal paths below */
  }
  candidates.push(path.join(HERE, '..', 'node_modules', 'axe-core', 'axe.min.js'));
  candidates.push(path.join(HERE, '..', '..', '..', 'node_modules', 'axe-core', 'axe.min.js'));
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      cachedPath = c;
      return cachedPath;
    }
  }
  throw new Error(
    'axe-core not found. Run `pnpm install --filter @geeksuite/mobile-harness` ' +
      '(it is a devDependency of the harness, pinned in tools/mobile-harness/package.json).',
  );
}

// Inject axe into the page if it is not already there. Scenes are walked in
// one long-lived page per viewport, and a `goto` wipes the injection, so this
// is called per scene and is cheap when it is a no-op.
export async function ensureAxe(page) {
  const present = await page.evaluate(() => typeof window.axe !== 'undefined').catch(() => false);
  if (present) return true;
  await page.addScriptTag({ path: axeScriptPath() });
  return page.evaluate(() => typeof window.axe !== 'undefined');
}
