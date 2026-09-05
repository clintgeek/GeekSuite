// Drives one app: open a context per viewport, wire its fixtures, walk its
// scenes, screenshot each one and probe it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, newContext, viewportSpec, PHONE_VIEWPORTS } from './contexts.mjs';
import { probePage, partition } from './probe.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const TOOL_ROOT = path.resolve(HERE, '..');

export async function loadApp(app) {
  const fixtures = await import(path.join(TOOL_ROOT, 'apps', app, 'fixtures.mjs'));
  const scenes = await import(path.join(TOOL_ROOT, 'apps', app, 'scenes.mjs'));
  return { fixtures, scenes: scenes.scenes || [], waivers: scenes.waivers || [] };
}

const settle = (page) => async (ms = 600) => page.waitForTimeout(ms);

export async function runApp({
  app,
  base,
  outDir,
  viewports = PHONE_VIEWPORTS,
  browser: existing = null,
  screenshots = true,
  quiet = false,
}) {
  const { fixtures, scenes, waivers } = await loadApp(app);
  const browser = existing || (await launch());
  const results = [];
  if (screenshots) fs.mkdirSync(outDir, { recursive: true });

  try {
    for (const key of viewports) {
      const spec = viewportSpec(key);
      const ctx = await newContext(browser, key, { base });
      await fixtures.routes(ctx, { base, scheme: spec.scheme, viewport: spec.label });
      const page = await ctx.newPage();
      const pageErrors = [];
      page.on('pageerror', (e) => pageErrors.push(String(e.message || e)));

      const h = {
        page,
        base,
        viewport: spec.label,
        scheme: spec.scheme,
        isPhone: spec.label === 'phone',
        settle: settle(page),
        async esc(ms = 500) {
          await page.keyboard.press('Escape');
          await page.waitForTimeout(ms);
        },
        log: (...a) => !quiet && console.log('   ', ...a),
      };

      for (const scene of scenes) {
        if (scene.viewports && !scene.viewports.includes(spec.label)) continue;
        const name = scene.name;
        try {
          if (scene.goto) {
            await page.goto(base + scene.goto, { waitUntil: 'networkidle' });
            await page.waitForTimeout(scene.wait ?? 1200);
          }
          if (scene.setup) {
            const proceed = await scene.setup(page, h);
            if (proceed === false) {
              results.push({ viewport: key, scene: name, skipped: true, open: [], waived: [] });
              continue;
            }
          }
          if (screenshots) {
            await page.screenshot({ path: path.join(outDir, `${app}-${name}-${spec.scheme}${spec.suffix}.png`) });
          }
          const raw = scene.probe === false ? [] : await probePage(page, { isPhone: h.isPhone });
          const { open, waived } = partition(raw, waivers, name);
          results.push({ viewport: key, scene: name, open, waived });
          if (!quiet) {
            const mark = open.length ? `${open.length} violation(s)` : 'clean';
            console.log(`  ${key} ${name}: ${mark}${waived.length ? ` (${waived.length} waived)` : ''}`);
          }
          if (scene.teardown) await scene.teardown(page, h);
        } catch (err) {
          results.push({ viewport: key, scene: name, error: String(err.message || err), open: [], waived: [] });
          if (!quiet) console.log(`  ${key} ${name}: ERROR ${err.message || err}`);
        }
      }

      if (pageErrors.length) {
        results.push({ viewport: key, scene: '(page)', pageErrors, open: [], waived: [] });
      }
      await ctx.close();
    }
  } finally {
    if (!existing) await browser.close();
  }

  return { app, base, results };
}

export function summarize(runs) {
  const violations = [];
  const errors = [];
  let scenesRun = 0;
  let waivedCount = 0;
  for (const run of runs) {
    for (const r of run.results) {
      if (r.scene !== '(page)' && !r.skipped) scenesRun += 1;
      waivedCount += (r.waived || []).length;
      for (const v of r.open || []) violations.push({ app: run.app, viewport: r.viewport, scene: r.scene, ...v });
      if (r.error) errors.push({ app: run.app, viewport: r.viewport, scene: r.scene, message: r.error });
      for (const e of r.pageErrors || []) errors.push({ app: run.app, viewport: r.viewport, scene: r.scene, message: e });
    }
  }
  return { scenesRun, waivedCount, violations, errors, ok: violations.length === 0 && errors.length === 0 };
}

export function report(summary) {
  console.log('');
  console.log(`scenes: ${summary.scenesRun}  violations: ${summary.violations.length}  page errors: ${summary.errors.length}  waived: ${summary.waivedCount}`);
  if (summary.violations.length) {
    console.log('\n── mobile grammar violations ───────────────────────────────');
    for (const v of summary.violations) {
      console.log(`  [${v.rule}] ${v.app} ${v.viewport} ${v.scene}\n      ${v.el}\n      hint: ${v.hint}\n      ${v.detail}`);
    }
  }
  if (summary.errors.length) {
    console.log('\n── page errors ─────────────────────────────────────────────');
    for (const e of summary.errors) console.log(`  ${e.app} ${e.viewport} ${e.scene}: ${e.message}`);
  }
}
