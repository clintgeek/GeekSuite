#!/usr/bin/env node
// Unit coverage for lib/probe.mjs. There is no test runner in this tool, so
// this is a small, standalone script: load the static fixtures through the
// same probe code the harness uses, assert on the violations it reports, and
// exit non-zero on any mismatch.
//
// Two suites:
//   1. tap-target — the pseudo-element hit-area logic, against
//      fixtures/tap-target-pseudo.html.
//   2. a11y       — the axe-core pass, against fixtures/a11y.html, which
//      plants exactly two violations (an image with no alt, a button with no
//      accessible name) next to clean controls of both kinds.
//
//   node tools/mobile-harness/selftest.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, newContext } from './lib/contexts.mjs';
import { probePage, partition } from './lib/probe.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(HERE, 'fixtures', 'tap-target-pseudo.html');
const A11Y_FIXTURE = path.join(HERE, 'fixtures', 'a11y.html');

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
  {
    label: 'rating-star-for-label',
    expect: 'pass',
    why: 'MUI <Rating> pattern: 1x1 visually-hidden radio, for-linked (sibling, not nested) <label> 44x44',
  },
  {
    label: 'rating-star-for-label-small',
    expect: 'fail',
    why: 'same for-linked pattern, but the label itself is only 30x30 — union still fails',
  },
  {
    label: 'rating-star-for-label-empty',
    expect: 'pass',
    why: 'for-linked label paints zero width (MUI Rating precision<1 collapses non-selected half-star labels) — no rendered area to tap, so skipped rather than flagged',
  },
];

const browser = await launch();
let failures = 0;
const fail = (msg) => {
  failures += 1;
  console.log(`FAIL — ${msg}`);
};
try {
  console.log('── tap-target (fixtures/tap-target-pseudo.html) ────────────');
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
  await ctx.close();

  // ── a11y ────────────────────────────────────────────────────────────────
  // The fixture is deliberately dull: black on white at 16px, 44px controls,
  // a lang attribute and a title. The only things wrong with it are the two
  // planted violations, so the assertion can be "exactly these two rules",
  // not "at least these two" — which is what actually catches a regression
  // where the runOnly tags or the injection quietly stop working.
  console.log('\n── a11y (fixtures/a11y.html) ───────────────────────────────');
  const a11yCtx = await newContext(browser, 'phone-light', {});
  const a11yPage = await a11yCtx.newPage();
  await a11yPage.goto(`file://${A11Y_FIXTURE}`);
  const all = await probePage(a11yPage, { isPhone: true, a11y: true });
  const found = all.filter((v) => v.category === 'a11y');

  const EXPECTED = [
    { rule: 'image-alt', el: 'bad-image', why: '<img> with no alt attribute' },
    { rule: 'button-name', el: 'bad-button', why: 'visible <button> with no text, aria-label or title' },
  ];

  for (const want of EXPECTED) {
    const hit = found.find((v) => v.rule === want.rule);
    if (!hit) {
      fail(`a11y: expected rule "${want.rule}" (${want.why}) — not reported`);
      continue;
    }
    console.log(`ok   — ${want.rule}: ${hit.impact}, ${hit.nodes} node(s), hint ${hit.hint}`);
    if (hit.nodes !== 1) fail(`a11y: ${want.rule} reported ${hit.nodes} node(s), expected 1 (the clean control must not be flagged)`);
    if (!hit.hint.includes(want.el)) fail(`a11y: ${want.rule} hint "${hit.hint}" does not point at #${want.el}`);
    if (!hit.helpUrl.startsWith('http')) fail(`a11y: ${want.rule} carries no help URL`);
    if (!hit.impact) fail(`a11y: ${want.rule} carries no impact`);
    if (!(hit.targets || []).some((t) => t.includes(want.el))) fail(`a11y: ${want.rule} targets ${JSON.stringify(hit.targets)} miss #${want.el}`);
  }

  const wanted = new Set(EXPECTED.map((e) => e.rule));
  const extra = found.filter((v) => !wanted.has(v.rule));
  if (extra.length) {
    fail(`a11y: ${extra.length} unexpected violation(s) on a fixture that should only have two:`);
    for (const v of extra) console.log(`   [${v.rule}] ${v.el} — ${v.detail}`);
  } else {
    console.log(`ok   — no violations beyond the two planted ones (${found.length} total)`);
  }

  // The clean controls must be clean: nothing may name them.
  for (const clean of ['good-image', 'good-button', 'good-icon-button']) {
    const named = found.filter((v) => `${v.hint} ${v.el} ${(v.targets || []).join(' ')}`.includes(clean));
    if (named.length) fail(`a11y: control #${clean} is a control and should be clean, but ${named.map((v) => v.rule).join(', ')} names it`);
    else console.log(`ok   — #${clean} clean`);
  }

  // A `{ rule, selector }` waiver takes an a11y finding off the open list.
  const waivers = [{ rule: 'image-alt', selector: '#bad-image', why: 'selftest: proves the a11y waiver shape' }];
  const parted = partition(found, waivers, 'selftest');
  if (parted.waived.length !== 1 || parted.waived[0].rule !== 'image-alt') {
    fail(`a11y waiver: expected image-alt waived, got ${JSON.stringify(parted.waived.map((v) => v.rule))}`);
  } else if (parted.open.some((v) => v.rule === 'image-alt')) {
    fail('a11y waiver: image-alt is both waived and open');
  } else {
    console.log(`ok   — { rule, selector } waiver moved image-alt to waived (${parted.open.length} still open)`);
  }
  // …and a waiver whose selector does not match must not fire.
  const missWaiver = partition(found, [{ rule: 'image-alt', selector: '#nope', why: 'should not match' }], 'selftest');
  if (missWaiver.waived.length) fail('a11y waiver: a non-matching selector waived something anyway');
  else console.log('ok   — a non-matching selector waives nothing');

  await a11yCtx.close();
} finally {
  await browser.close();
}

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');
