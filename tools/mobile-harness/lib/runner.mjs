// Drives one app: open a context per viewport, wire its fixtures, walk its
// scenes, screenshot each one and probe it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, newContext, viewportSpec, PHONE_VIEWPORTS } from './contexts.mjs';
import { probePage, partition, isA11y } from './probe.mjs';

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
  a11y = true,
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
          const raw = scene.probe === false ? [] : await probePage(page, { isPhone: h.isPhone, a11y });
          const { open, waived } = partition(raw, waivers, name);
          results.push({ viewport: key, scene: name, open, waived });
          if (!quiet) {
            // a11y is report-only by default, so it is counted separately in
            // the per-scene line too — otherwise "12 violation(s)" on a scene
            // whose grammar is clean reads as a regression.
            const grammar = open.filter((v) => !isA11y(v));
            const a11yOpen = open.filter(isA11y);
            const mark = grammar.length ? `${grammar.length} violation(s)` : 'clean';
            const extra = [
              a11yOpen.length ? `${a11yOpen.length} a11y` : '',
              waived.length ? `${waived.length} waived` : '',
            ].filter(Boolean);
            console.log(`  ${key} ${name}: ${mark}${extra.length ? ` (${extra.join(', ')})` : ''}`);
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

// `enforceA11y` decides whether the axe findings count toward `ok` (and so
// toward the exit code). Default off: the three grammar rules are the gate,
// a11y is a burn-down list until it reaches zero (DOCS/MOBILE_UI_PLAN §2).
export function summarize(runs, { enforceA11y = false } = {}) {
  const violations = [];
  const a11y = [];
  const errors = [];
  let scenesRun = 0;
  let waivedCount = 0;
  let a11yWaivedCount = 0;
  for (const run of runs) {
    for (const r of run.results) {
      if (r.scene !== '(page)' && !r.skipped) scenesRun += 1;
      waivedCount += (r.waived || []).length;
      a11yWaivedCount += (r.waived || []).filter(isA11y).length;
      for (const v of r.open || []) {
        const row = { app: run.app, viewport: r.viewport, scene: r.scene, ...v };
        (isA11y(v) ? a11y : violations).push(row);
      }
      if (r.error) errors.push({ app: run.app, viewport: r.viewport, scene: r.scene, message: r.error });
      for (const e of r.pageErrors || []) errors.push({ app: run.app, viewport: r.viewport, scene: r.scene, message: e });
    }
  }
  const enforced = enforceA11y ? violations.length + a11y.length : violations.length;
  return {
    scenesRun,
    waivedCount,
    a11yWaivedCount,
    violations,
    a11y,
    a11yByRule: groupA11y(a11y),
    enforceA11y,
    errors,
    ok: enforced === 0 && errors.length === 0,
  };
}

// The burn-down table: one row per axe rule id, with the apps it fires in and
// how many findings each contributed. Sorted worst-first, impact breaking ties.
const IMPACT_ORDER = ['critical', 'serious', 'moderate', 'minor', 'unknown'];
export function groupA11y(rows) {
  const byRule = new Map();
  for (const v of rows) {
    let entry = byRule.get(v.rule);
    if (!entry) {
      entry = { rule: v.rule, impact: v.impact || 'unknown', helpUrl: v.helpUrl || '', findings: 0, nodes: 0, apps: new Map() };
      byRule.set(v.rule, entry);
    }
    entry.findings += 1;
    entry.nodes += v.nodes || 0;
    entry.apps.set(v.app, (entry.apps.get(v.app) || 0) + 1);
    if (IMPACT_ORDER.indexOf(v.impact) > -1 && IMPACT_ORDER.indexOf(v.impact) < IMPACT_ORDER.indexOf(entry.impact)) {
      entry.impact = v.impact;
    }
  }
  return [...byRule.values()]
    .map((e) => ({ ...e, apps: [...e.apps.entries()].sort((a, b) => b[1] - a[1]) }))
    .sort((a, b) => b.findings - a.findings || IMPACT_ORDER.indexOf(a.impact) - IMPACT_ORDER.indexOf(b.impact) || a.rule.localeCompare(b.rule));
}

export function report(summary) {
  console.log('');
  console.log(
    `scenes: ${summary.scenesRun}  violations: ${summary.violations.length}  ` +
      `a11y: ${summary.a11y.length}${summary.enforceA11y ? ' (enforcing)' : ' (report-only)'}  ` +
      `page errors: ${summary.errors.length}  waived: ${summary.waivedCount}`,
  );
  if (summary.violations.length) {
    console.log('\n── mobile grammar violations ───────────────────────────────');
    for (const v of summary.violations) {
      console.log(`  [${v.rule}] ${v.app} ${v.viewport} ${v.scene}\n      ${v.el}\n      hint: ${v.hint}\n      ${v.detail}`);
    }
  }
  if (summary.a11y.length) {
    console.log(
      `\n── a11y (axe-core wcag2a+wcag2aa) ${summary.enforceA11y ? '── ENFORCING ' : '── report only '}` +
        '─────────',
    );
    for (const e of summary.a11yByRule) {
      const apps = e.apps.map(([app, n]) => `${app} ${n}`).join(', ');
      console.log(`  ${e.rule} (${e.impact}) — ${e.findings} finding(s), ${e.nodes} node(s)`);
      console.log(`      apps: ${apps}`);
      if (e.helpUrl) console.log(`      ${e.helpUrl}`);
    }
    console.log('\n  first offender per rule per app:');
    const seen = new Set();
    for (const v of summary.a11y) {
      const key = `${v.rule}|${v.app}`;
      if (seen.has(key)) continue;
      seen.add(key);
      console.log(`  [a11y:${v.rule}] ${v.app} ${v.viewport} ${v.scene}\n      ${v.el}\n      hint: ${v.hint}\n      ${v.detail}`);
    }
  }
  if (summary.errors.length) {
    console.log('\n── page errors ─────────────────────────────────────────────');
    for (const e of summary.errors) console.log(`  ${e.app} ${e.viewport} ${e.scene}: ${e.message}`);
  }
}

// The same a11y burn-down as a Markdown table, written next to the
// screenshots so the CI artifact carries the numbers, not just the pixels.
export function summaryMarkdown(summary, { label = 'ci', apps = [] } = {}) {
  const lines = [];
  lines.push('# Mobile harness run');
  lines.push('');
  lines.push(`- label: \`${label}\``);
  lines.push(`- apps: ${apps.join(', ') || '(all)'}`);
  lines.push(`- scenes: ${summary.scenesRun}`);
  lines.push(`- grammar violations (enforcing): **${summary.violations.length}**`);
  lines.push(`- a11y findings (${summary.enforceA11y ? 'enforcing' : 'report-only'}): **${summary.a11y.length}**`);
  lines.push(`- page errors: ${summary.errors.length}`);
  lines.push(`- waived: ${summary.waivedCount} (${summary.a11yWaivedCount} a11y)`);
  lines.push(`- result: **${summary.ok ? 'PASS' : 'FAIL'}**`);
  lines.push('');

  lines.push('## a11y (axe-core, WCAG 2 A + AA) — by rule');
  lines.push('');
  if (!summary.a11y.length) {
    lines.push('No axe violations. If this holds across every app, flip `--enforce-a11y` on (MOBILE_UI_PLAN §2).');
  } else {
    const appNames = [...new Set(summary.a11y.map((v) => v.app))].sort();
    lines.push(`| rule | impact | findings | nodes | ${appNames.join(' | ')} |`);
    lines.push(`|---|---|--:|--:|${appNames.map(() => '--:').join('|')}|`);
    for (const e of summary.a11yByRule) {
      const per = new Map(e.apps);
      lines.push(
        `| [\`${e.rule}\`](${e.helpUrl}) | ${e.impact} | ${e.findings} | ${e.nodes} | ` +
          `${appNames.map((a) => per.get(a) || '·').join(' | ')} |`,
      );
    }
  }
  lines.push('');

  if (summary.violations.length) {
    lines.push('## grammar violations');
    lines.push('');
    for (const v of summary.violations) {
      lines.push(`- \`[${v.rule}]\` ${v.app} ${v.viewport} ${v.scene} — \`${v.hint}\` — ${v.detail}`);
    }
    lines.push('');
  }
  if (summary.errors.length) {
    lines.push('## page errors');
    lines.push('');
    for (const e of summary.errors) lines.push(`- ${e.app} ${e.viewport} ${e.scene}: ${e.message}`);
    lines.push('');
  }
  return lines.join('\n');
}
