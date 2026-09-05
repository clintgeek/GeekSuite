#!/usr/bin/env node
// Unit coverage for the tap-target pseudo-element hit-area logic in
// lib/probe.mjs. There is no test runner in this tool, so this is a small,
// standalone script: load the static fixture through the same probe code the
// harness uses, assert on the violations it reports, and exit non-zero on any
// mismatch.
//
//   node tools/mobile-harness/selftest.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, newContext } from './lib/contexts.mjs';
import { probePage } from './lib/probe.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(HERE, 'fixtures', 'tap-target-pseudo.html');

// { aria-label, expect: 'pass' | 'fail' }
const CASES = [
  {
    label: 'positioned-inset',
    expect: 'pass',
    why: '30px button, ::before positioned via inset:-7px (30+7+7=44)',
  },
  {
    label: 'unpositioned',
    expect: 'fail',
    why: '30px button, ::before present but position:static — cannot enlarge the hit area',
  },
  {
    label: 'pointer-events-none',
    expect: 'fail',
    why: '30px button, ::before positioned and big enough but pointer-events:none',
  },
  {
    label: 'dot',
    expect: 'pass',
    why: '.dot: 9px visual, ::before inset:-17.5px (9+17.5+17.5=44)',
  },
  {
    label: 'hit44',
    expect: 'pass',
    why: '.hit44: 30px visual, ::before centred via top/left:50%+translate(-50%,-50%), 44x44',
  },
];

const browser = await launch();
let failures = 0;
try {
  // The real iPhone 14 device profile (contexts.mjs) — deviceScaleFactor 3,
  // same as every production run. A bare 1x viewport rounds a 1.5px CSS
  // border down to 1 device px and throws the `.dot` math off by a pixel;
  // the harness never actually runs at 1x, so match its real context here.
  const ctx = await newContext(browser, 'phone-dark', {});
  const page = await ctx.newPage();
  await page.goto(`file://${FIXTURE}`);
  const violations = await probePage(page, { isPhone: true });
  const tapViolations = violations.filter((v) => v.rule === 'tap-target');

  for (const c of CASES) {
    const hit = tapViolations.find((v) => v.el.includes(`aria-label="${c.label}"`));
    const gotFail = Boolean(hit);
    const wantFail = c.expect === 'fail';
    const ok = gotFail === wantFail;
    if (!ok) failures += 1;
    console.log(
      `${ok ? 'ok  ' : 'FAIL'} — ${c.label}: expected ${c.expect}, got ${gotFail ? 'fail' : 'pass'}` +
        `${hit ? ` (${hit.detail})` : ''} — ${c.why}`,
    );
  }

  // Nothing outside the four cases should be flagging tap-target on this
  // fixture — a stray violation means the probe is walking something it
  // should not (or double-counting).
  const known = new Set(CASES.map((c) => c.label));
  const stray = tapViolations.filter((v) => {
    const m = v.el.match(/aria-label="([^"]+)"/);
    return !m || !known.has(m[1]);
  });
  if (stray.length) {
    failures += 1;
    console.log(`FAIL — ${stray.length} unexpected tap-target violation(s):`);
    for (const v of stray) console.log(`   ${v.el} ${v.detail}`);
  }
} finally {
  await browser.close();
}

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');
