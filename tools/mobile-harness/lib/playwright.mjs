// Resolving Playwright without assuming where it lives.
//
// In CI the tool's own devDependency is installed and `import('playwright')`
// wins. On Chef's box the browsers are already downloaded under a skills
// checkout, so PLAYWRIGHT_MODULE (or the known fallback path) points at that
// install instead of paying for a second 150MB download.
const FALLBACKS = [
  process.env.PLAYWRIGHT_MODULE,
  '/home/crocker/.agents/skills/playwright/node_modules/playwright/index.mjs',
  '/home/crocker/.agents/skills.bak-20260904-233317/playwright/node_modules/playwright/index.mjs',
].filter(Boolean);

let cached = null;

export async function loadPlaywright() {
  if (cached) return cached;
  try {
    cached = await import('playwright');
    return cached;
  } catch {
    /* fall through to the local installs */
  }
  for (const candidate of FALLBACKS) {
    try {
      cached = await import(candidate.startsWith('/') ? `file://${candidate}` : candidate);
      return cached;
    } catch {
      /* try the next one */
    }
  }
  throw new Error(
    'Playwright not found. Run `pnpm install --filter @geeksuite/mobile-harness` and ' +
      '`npx playwright install --with-deps chromium`, or set PLAYWRIGHT_MODULE to an existing install.',
  );
}
