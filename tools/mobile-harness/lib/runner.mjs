// Drives one app: open a context per viewport, wire its fixtures, walk its
// scenes, screenshot each one and probe it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, newContext, viewportSpec, PHONE_VIEWPORTS } from './contexts.mjs';
import { probePage, partition, isA11y } from './probe.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const TOOL_ROOT = path.resolve(HERE, '..');

// CSS width of a viewport spec; phone devices come from Playwright's
// descriptor, which the runner does not load, so they read as 390.
const viewportWidth = (spec) => (spec.overrides?.viewport || spec.viewport || { width: 390 }).width;

export async function loadApp(app) {
  const fixtures = await import(path.join(TOOL_ROOT, 'apps', app, 'fixtures.mjs'));
  const scenes = await import(path.join(TOOL_ROOT, 'apps', app, 'scenes.mjs'));
  return { fixtures, scenes: scenes.scenes || [], waivers: scenes.waivers || [] };
}

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
      const pageErrors = [];
      // HARNESS_CPU_THROTTLE=4 slows this machine's Chromium down to roughly
      // a CI runner's speed, to reproduce timing-only failures locally. Off
      // by default; Chromium only (CDP).
      const throttle = Number(process.env.HARNESS_CPU_THROTTLE || 0);
      const openPage = async () => {
        const p = await ctx.newPage();
        if (throttle > 1) {
          const cdp = await ctx.newCDPSession(p);
          await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
        }
        p.on('pageerror', (e) => pageErrors.push(String(e.message || e)));
        return p;
      };
      let page = await openPage();

      const h = {
        page,
        base,
        viewport: spec.label,
        scheme: spec.scheme,
        // "The phone LAYOUT", which is how every scene uses it: open the
        // drawer, the tags sheet, the bottom bar. A portrait tablet (800px)
        // sits under the suite's 900px nav breakpoint and gets that layout,
        // so it is true there too — that is what lets existing scenes run on
        // the tablet unchanged (review 4.1). When an app grows a tablet
        // layout (D9: a rail from 600px), its scenes branch on `isTablet` /
        // `form` first. The tap-target rule does not read this: it follows
        // `coarse` (see the probe call below).
        isPhone: spec.label === 'phone' || (spec.label === 'tablet' && viewportWidth(spec) < 900),
        isTablet: spec.label === 'tablet',
        form: spec.form,
        coarse: Boolean(spec.coarse),
        width: viewportWidth(spec),
        height: (spec.overrides?.viewport || spec.viewport || { height: 844 }).height,
        get landscape() {
          return this.width > this.height;
        },
        get compact() {
          return this.width < 900;
        },
        settle: (ms = 600) => page.waitForTimeout(ms),
        async esc(ms = 500) {
          await page.keyboard.press('Escape');
          await page.waitForTimeout(ms);
        },
        log: (...a) => !quiet && console.log('   ', ...a),
      };

      for (const scene of scenes) {
        if (scene.viewports && !scene.viewports.includes(spec.label) && !scene.viewports.includes(spec.form)) continue;
        const name = scene.name;
        // HARNESS_SCENES='^6' runs only the scenes whose name matches (local iteration).
        if (process.env.HARNESS_SCENES && !new RegExp(process.env.HARNESS_SCENES).test(name)) continue;
        try {
          // `freshPage: true` starts the scene in a new tab. One page serves a
          // whole viewport, and every page.click() before this scene left
          // Chromium's mouse cursor parked where it clicked, across
          // navigations. A phone has no cursor; a parked one is moved back
          // over its old spot right after a touch tap, so the tap's own
          // mouseleave hides a tap-opened tooltip (53d/53e, 2026-10-29).
          if (scene.freshPage) {
            await page.close();
            page = await openPage();
            h.page = page;
          }
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
          // tap-target is enforced wherever the pointer is a finger (phone and
          // tablet, any width), not by width: review 4.3.
          const raw = scene.probe === false ? [] : await probePage(page, { isPhone: h.coarse, a11y });
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
//
// `advisoryViewports` (viewport keys) are walked and reported but never
// count toward `ok`: their findings land in `summary.advisory` instead. CI
// uses it for the tablet contexts (--tablet-advisory) until the tablet wave
// burns them down, the same way a11y was report-only before 2026-09-05.
export function summarize(runs, { enforceA11y = false, advisoryViewports = [] } = {}) {
  const violations = [];
  const a11y = [];
  const errors = [];
  const advisory = { violations: [], a11y: [], errors: [] };
  const isAdvisory = (viewport) => advisoryViewports.includes(viewport);
  let scenesRun = 0;
  let waivedCount = 0;
  let a11yWaivedCount = 0;
  for (const run of runs) {
    for (const r of run.results) {
      if (r.scene !== '(page)' && !r.skipped) scenesRun += 1;
      waivedCount += (r.waived || []).length;
      a11yWaivedCount += (r.waived || []).filter(isA11y).length;
      const sink = isAdvisory(r.viewport) ? advisory : { violations, a11y, errors };
      for (const v of r.open || []) {
        const row = { app: run.app, viewport: r.viewport, scene: r.scene, ...v };
        (isA11y(v) ? sink.a11y : sink.violations).push(row);
      }
      if (r.error) sink.errors.push({ app: run.app, viewport: r.viewport, scene: r.scene, message: r.error });
      for (const e of r.pageErrors || []) sink.errors.push({ app: run.app, viewport: r.viewport, scene: r.scene, message: e });
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
    advisory,
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
  const adv = summary.advisory;
  if (adv && adv.violations.length + adv.a11y.length + adv.errors.length) {
    console.log(
      `\n── advisory (not gating): ${adv.violations.length} grammar, ${adv.a11y.length} a11y, ` +
        `${adv.errors.length} errors ──`,
    );
    for (const v of [...adv.violations, ...adv.a11y]) {
      console.log(`  [${isA11y(v) ? `a11y:${v.rule}` : v.rule}] ${v.app} ${v.viewport} ${v.scene}\n      ${v.el}\n      ${v.detail}`);
    }
    for (const e of adv.errors) console.log(`  ${e.app} ${e.viewport} ${e.scene}: ${e.message}`);
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
  const adv = summary.advisory;
  if (adv && adv.violations.length + adv.a11y.length + adv.errors.length) {
    lines.push('## advisory — reported, not gating (tablet until the tablet wave lands)');
    lines.push('');
    for (const v of [...adv.violations, ...adv.a11y]) {
      lines.push(`- \`[${isA11y(v) ? `a11y:${v.rule}` : v.rule}]\` ${v.app} ${v.viewport} ${v.scene} — \`${v.hint}\` — ${v.detail}`);
    }
    for (const e of adv.errors) lines.push(`- error: ${e.app} ${e.viewport} ${e.scene}: ${e.message}`);
    lines.push('');
  }
  return lines.join('\n');
}
