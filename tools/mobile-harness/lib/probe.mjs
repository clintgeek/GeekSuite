// The mobile-grammar probe — the CI gate for MOBILE_UI_PLAN.md §6.
//
// Three rules:
//   tap-target  every visible interactive element is at least 44x44 —
//               phone viewport only (MOBILE_UI_PLAN §2: 44px is the rule
//               below `md`; nothing in the grammar promises it at desktop
//               widths, and grading a 1280-wide layout against it is just
//               noise on the gate). The measured box is a union of the
//               element's own rect with any absolutely positioned
//               `::before`/`::after` hit-area pseudo (see `pseudoHitBox`
//               below), so `.hit44`/`.dot`-style invisible expanded targets
//               are not false positives.
//   text-floor  no visible readable string below 12px — every viewport.
//   h-scroll    the document does not scroll sideways — every viewport.
//
// It runs in the page, so it sees computed styles rather than source. That
// catches the whole class of "the sx says 44 but a parent squeezed it".
//
// A fourth category, `a11y`, is the axe-core pass (WCAG 2 A + AA, see
// `lib/a11y.mjs`). It is **report-only** unless `--enforce-a11y` is passed:
// the three grammar rules above stay the gate, a11y is a burn-down list.
//
// Every finding carries a `category` (one of GRAMMAR_RULES plus `a11y`) and a
// `rule`. For the grammar rules the two are the same string; for a11y the
// category is `a11y` and the rule is the axe rule id (`image-alt`,
// `color-contrast`, …), so findings group by rule id in the report.

import { AXE_OPTIONS, ensureAxe } from './a11y.mjs';

const GRAMMAR_RULES = ['tap-target', 'text-floor', 'h-scroll'];
const CATEGORIES = [...GRAMMAR_RULES, 'a11y'];

const collect = async ({ isPhone, a11y = false, axeOptions = null }) => {
  const INTERACTIVE = [
    'a[href]', 'button', 'input:not([type=hidden])', 'select', 'textarea', 'summary',
    '[role=button]', '[role=link]', '[role=tab]', '[role=switch]', '[role=checkbox]',
    '[role=radio]', '[role=menuitem]', '[role=menuitemcheckbox]', '[role=option]',
    '[contenteditable=true]', '[tabindex]:not([tabindex="-1"])',
  ].join(',');

  const violations = [];
  const seen = new WeakSet();

  const describe = (el) => {
    const bits = [el.tagName.toLowerCase()];
    if (el.id) bits.push(`#${el.id}`);
    const cls = (el.getAttribute('class') || '')
      .split(/\s+/).filter(Boolean).filter((c) => !/^css-/.test(c)).slice(0, 2);
    if (cls.length) bits.push(`.${cls.join('.')}`);
    for (const attr of el.attributes || []) {
      if (attr.name.startsWith('data-geek')) bits.push(`[${attr.name}="${attr.value}"]`);
    }
    const label = el.getAttribute('aria-label') || el.getAttribute('title') || '';
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 48);
    let out = bits.join('');
    if (label) out += ` aria-label="${label.slice(0, 40)}"`;
    if (text) out += ` "${text}"`;
    return out;
  };

  // A short, stable hint for the human (or agent) fixing this — something
  // greppable in the app's source, ranked most- to least-durable: an
  // explicit test hook, then the suite's own data-geek-* markers, then
  // aria-label/id, then (last resort, nothing else survives a refactor) a
  // short tag+class path up from the element.
  const selectorHint = (el) => {
    for (const attr of ['data-testid', 'data-test', 'data-geek-testid']) {
      if (el.hasAttribute(attr)) return `[${attr}="${el.getAttribute(attr)}"]`;
    }
    for (const attr of el.attributes || []) {
      if (attr.name.startsWith('data-geek')) return `[${attr.name}="${attr.value}"]`;
    }
    const label = el.getAttribute('aria-label');
    if (label) return `[aria-label="${label.slice(0, 60)}"]`;
    if (el.id) return `#${el.id}`;
    const seg = (node) => {
      const tag = node.tagName.toLowerCase();
      const cls = (node.getAttribute('class') || '')
        .split(/\s+/).filter(Boolean).filter((c) => !/^css-/.test(c)).slice(0, 2);
      return cls.length ? `${tag}.${cls.join('.')}` : tag;
    };
    const path = [];
    let node = el;
    for (let i = 0; i < 3 && node && node !== document.body; i += 1, node = node.parentElement) {
      path.unshift(seg(node));
    }
    return path.join(' > ');
  };

  const hidden = (el) => {
    if (typeof el.checkVisibility === 'function') {
      if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return true;
    }
    if (el.closest('[aria-hidden="true"], [inert], [hidden]')) return true;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return true;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return true;
    // Off-canvas horizontally: a closed drawer or a sheet parked outside the
    // frame. A below-the-fold element is still a real target, so only the
    // horizontal axis disqualifies.
    if (r.right <= 0 || r.left >= window.innerWidth) return true;
    return false;
  };

  // Everything that is interactive for a reason other than a bare tabindex.
  // MUI's MenuList clones tabIndex=0 onto the first child of an open menu —
  // often a decorative header — and that focus stop is not a tap target.
  const REAL = INTERACTIVE.split(',').filter((s) => !s.startsWith('[tabindex')).join(',');

  // A control can enlarge its own hit area with an invisible, absolutely
  // positioned `::before`/`::after` — startgeek's `.hit44` (a centred 44x44
  // pseudo behind a small glyph) and `.dot` (a 9px status dot, 44px pseudo)
  // are the suite's pattern for this. getBoundingClientRect cannot see a
  // pseudo-element, so its box has to be derived from computed style:
  //
  //  - The pseudo only counts if it has real content, is itself
  //    `position: absolute|fixed`, and `el` is its containing block (i.e.
  //    `el`'s own position is not `static`). An unpositioned decorative
  //    pseudo cannot enlarge anything a finger can land on.
  //  - `pointer-events: none` on the pseudo means it never receives the tap,
  //    so it is ignored even when positioned and large.
  //  - Offsets/size are read off the computed longhands (`inset: -Npx` is
  //    exposed as four resolved longhands) relative to `el`'s own rect
  //    (border box). That is a deliberate simplification of the true
  //    containing block (the padding box, per spec) — Chromium rounds a
  //    fractional border-width to a whole pixel (`.dot`'s 1.5px ring
  //    included), which shrinks the *true* padding box and would silently
  //    turn a hand-tuned `inset: -17.5px` into ~42x44 instead of 44x44.
  //    Measuring against the rect a human actually laid `inset` out against
  //    is more useful here than being technically pure about the containing
  //    block. Percentages resolve against the rect's own width/height.
  //  - Width/height is derived from a matched offset pair (`left`+`right`,
  //    `top`+`bottom`) against the rect when both resolve — the `inset`
  //    pattern — falling back to the pseudo's own resolved `width`/`height`
  //    when a transform is present or an offset pair does not resolve (the
  //    `.hit44` pattern: explicit `width`/`height`, positioned by a single
  //    `top`/`left` anchor + `translate(-50%,-50%)`, where the size *is* the
  //    authored value, not something to re-derive). `auto` offsets that
  //    leave an axis with neither a resolvable pair nor a usable anchor mean
  //    the pseudo is skipped rather than guessed at.
  //  - The engine already resolves a percentage `translate()` into a pixel
  //    matrix, so it is just read back out of `matrix(...)`.
  const pseudoHitBox = (el, pseudo) => {
    const elCS = getComputedStyle(el);
    if (elCS.position === 'static') return null; // el is not a containing block
    const cs = getComputedStyle(el, pseudo);
    if (!cs || cs.content === 'none') return null;
    if (cs.position !== 'absolute' && cs.position !== 'fixed') return null;
    if (cs.pointerEvents === 'none') return null;
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return null;

    const cb = el.getBoundingClientRect();
    const cw = cb.width;
    const ch = cb.height;

    const len = (raw, base) => {
      if (raw == null || raw === 'auto') return null;
      const s = String(raw).trim();
      if (s.endsWith('%')) {
        const pct = parseFloat(s);
        return Number.isFinite(pct) ? (pct / 100) * base : null;
      }
      const n = parseFloat(s);
      return Number.isFinite(n) ? n : null;
    };

    const left = len(cs.left, cw);
    const right = len(cs.right, cw);
    const top = len(cs.top, ch);
    const bottom = len(cs.bottom, ch);
    const hasTransform = cs.transform && cs.transform !== 'none';

    const width = !hasTransform && left != null && right != null ? cw - left - right : len(cs.width, cw);
    const height = !hasTransform && top != null && bottom != null ? ch - top - bottom : len(cs.height, ch);
    if (width == null || height == null || !(width > 0) || !(height > 0)) return null;

    let boxLeft;
    if (left != null) boxLeft = cb.left + left;
    else if (right != null) boxLeft = cb.left + cw - right - width;
    else return null; // neither horizontal offset resolvable

    let boxTop;
    if (top != null) boxTop = cb.top + top;
    else if (bottom != null) boxTop = cb.top + ch - bottom - height;
    else return null; // neither vertical offset resolvable

    if (hasTransform) {
      const m = cs.transform.match(/matrix\(([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),([^,]+)\)/);
      if (m) {
        boxLeft += parseFloat(m[5]);
        boxTop += parseFloat(m[6]);
      }
    }

    return { left: boxLeft, top: boxTop, right: boxLeft + width, bottom: boxTop + height };
  };

  // ── tap-target ──────────────────────────────────────────────────────────
  // Phone only: MOBILE_UI_PLAN §2 makes 44px a rule below `md`, not a
  // universal one, so a desktop-viewport scene has nothing to fail here.
  if (isPhone) {
    for (const el of document.querySelectorAll(INTERACTIVE)) {
      if (seen.has(el)) continue;
      seen.add(el);
      if (hidden(el)) continue;
      if (!el.matches(REAL) && !el.getAttribute('role')) continue;
      const cs = getComputedStyle(el);
      if (cs.pointerEvents === 'none') continue;
      // An inline link inside running prose is not a tap target in the 44px
      // sense; the paragraph around it is the reading surface.
      if (el.tagName === 'A' && cs.display.startsWith('inline')) {
        const parentText = (el.parentElement?.textContent || '').replace(/\s+/g, ' ').trim();
        const ownText = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (parentText.length > ownText.length + 8) continue;
      }
      const r = el.getBoundingClientRect();
      // The hit area may be larger than the paint: a bare icon inside a padded
      // wrapper counts as the wrapper. Measure the closest ancestor that is
      // itself only chrome for this control.
      let w = r.width;
      let h = r.height;
      const label = el.closest('label');
      if (label && (el.tagName === 'INPUT' || el.getAttribute('role') === 'checkbox')) {
        const lr = label.getBoundingClientRect();
        w = Math.max(w, lr.width);
        h = Math.max(h, lr.height);
      }
      // A form control's hit area is the bordered box around it, not the bare
      // <input> (MUI puts the padding on .MuiInputBase-root) and not one
      // section of a date field (.MuiPickersSectionList spans are one field).
      const field = el.closest(
        '[class*="MuiInputBase-root"], [class*="MuiPickersInputBase-root"], [class*="MuiOutlinedInput-root"], [class*="MuiFilledInput-root"]',
      );
      if (field && field !== el) {
        const fr = field.getBoundingClientRect();
        w = Math.max(w, fr.width);
        h = Math.max(h, fr.height);
      }
      // A slider's input is a 20px thumb; the rail is what the thumb drags on
      // and what the finger actually lands on, so measure the rail.
      const slider = el.closest('[class*="MuiSlider-root"], [role="slider"]');
      if (slider && slider !== el) {
        const sr = slider.getBoundingClientRect();
        w = Math.max(w, sr.width);
        h = Math.max(h, sr.height);
      }
      // Pseudo-element hit-area expansion (`.hit44`, `.dot`): union each
      // pseudo's derived box with the element's own rect. The control passes
      // if that union clears 44x44 even when the paint does not.
      const pseudoNames = [];
      let ux1 = r.left;
      let uy1 = r.top;
      let ux2 = r.right;
      let uy2 = r.bottom;
      for (const pseudo of ['::before', '::after']) {
        const box = pseudoHitBox(el, pseudo);
        if (!box) continue;
        pseudoNames.push(pseudo);
        ux1 = Math.min(ux1, box.left);
        uy1 = Math.min(uy1, box.top);
        ux2 = Math.max(ux2, box.right);
        uy2 = Math.max(uy2, box.bottom);
      }
      if (pseudoNames.length) {
        w = Math.max(w, ux2 - ux1);
        h = Math.max(h, uy2 - uy1);
      }
      if (w < 43.5 || h < 43.5) {
        let detail = `${Math.round(w)}x${Math.round(h)}`;
        if (pseudoNames.length) {
          detail += ` (with ${pseudoNames.join('+')} ${Math.round(ux2 - ux1)}x${Math.round(uy2 - uy1)})`;
        }
        violations.push({
          rule: 'tap-target',
          category: 'tap-target',
          el: describe(el),
          hint: selectorHint(el),
          detail,
        });
      }
    }
  }

  // ── text-floor ──────────────────────────────────────────────────────────
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const flagged = new WeakSet();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const raw = (node.nodeValue || '').replace(/\s+/g, ' ').trim();
    if (!raw) continue;
    const el = node.parentElement;
    if (!el || flagged.has(el)) continue;
    if (el.closest('svg, script, style, noscript, template')) continue;
    if (hidden(el)) continue;
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (!Number.isFinite(size) || size < 1) continue; // a 0px wrapper is a11y text
    if (size < 11.5) {
      flagged.add(el);
      violations.push({
        rule: 'text-floor',
        category: 'text-floor',
        el: describe(el),
        hint: selectorHint(el),
        detail: `${size.toFixed(1)}px "${raw.slice(0, 40)}"`,
      });
    }
  }

  // ── h-scroll ────────────────────────────────────────────────────────────
  const doc = document.scrollingElement || document.documentElement;
  if (doc.scrollWidth > doc.clientWidth + 1) {
    // Name the widest offender so the fix has somewhere to start.
    let worst = null;
    for (const el of document.body.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      const overhang = r.right + window.scrollX - doc.clientWidth;
      if (overhang > 1 && (!worst || overhang > worst.overhang)) worst = { el, overhang };
    }
    violations.push({
      rule: 'h-scroll',
      category: 'h-scroll',
      el: worst ? describe(worst.el) : 'document',
      hint: worst ? selectorHint(worst.el) : 'document',
      detail: `scrollWidth ${doc.scrollWidth} > clientWidth ${doc.clientWidth}`,
    });
  }

  // ── a11y (axe-core) ─────────────────────────────────────────────────────
  // One harness finding per axe *rule*, not per node: a page with 40 unlabelled
  // icon buttons is one `button-name` problem with 40 instances, and reading it
  // as 40 findings drowns everything else. The node count rides along in
  // `nodes`, and the first offending element is described with the same
  // `describe`/`selectorHint` the grammar rules use, so a fix pass greps for
  // exactly the same kind of selector it already knows.
  if (a11y && typeof window.axe !== 'undefined') {
    // axe target entries are CSS selectors. A nested array means the node is
    // inside an iframe (`[['#frame', '#el']]`); the last segment is the
    // element itself, which is the useful half.
    const leaf = (target) => {
      let t = target;
      while (Array.isArray(t)) t = t[t.length - 1];
      return t == null ? '' : String(t);
    };
    const res = await window.axe.run(document, axeOptions || undefined);
    for (const v of res.violations || []) {
      const nodes = v.nodes || [];
      const sel = nodes.length ? leaf(nodes[0].target) : '';
      let el = null;
      try {
        el = sel ? document.querySelector(sel) : null;
      } catch {
        el = null; // an axe shadow-DOM target is not a document-level selector
      }
      const why = String((nodes[0] && nodes[0].failureSummary) || v.help || '')
        .replace(/\s+/g, ' ')
        .replace(/^Fix (any|all) of the following:\s*/i, '')
        .trim()
        .slice(0, 140);
      violations.push({
        rule: v.id,
        category: 'a11y',
        impact: v.impact || 'unknown',
        nodes: nodes.length,
        helpUrl: v.helpUrl || '',
        el: el ? describe(el) : sel || '(document)',
        hint: el ? selectorHint(el) : sel || 'document',
        // Up to five raw axe selectors, so a `{ rule, selector }` waiver can
        // match an instance that is not the first one reported.
        targets: nodes.slice(0, 5).map((n) => leaf(n.target)),
        detail: `${v.impact || 'unknown'} · ${nodes.length} node(s) · ${why}`,
      });
    }
  }

  return violations;
};

// `isPhone` gates tap-target (see the header comment above); text-floor and
// h-scroll run regardless of viewport.
// `a11y` runs the axe-core pass as well; it is opt-in at this level (the
// runner turns it on, `selftest.mjs`'s tap-target fixture leaves it off) and
// costs one 580KB script injection per scene.
export async function probePage(page, { isPhone = true, a11y = false, axeOptions = AXE_OPTIONS } = {}) {
  if (a11y) {
    const ready = await ensureAxe(page);
    if (!ready) throw new Error('axe-core did not inject into the page (see lib/a11y.mjs)');
  }
  return page.evaluate(collect, { isPhone, a11y, axeOptions: a11y ? axeOptions : null });
}

// A waiver is `{ rule?, category?, match?, selector?, scenes?, why }`. Every
// field present must match (they AND together), and at least one of
// `rule`/`category`/`match`/`selector` has to be there — a waiver that only
// names scenes would silently waive the whole scene.
//
//   rule       exact: a grammar rule name (`text-floor`) or an axe rule id
//              (`color-contrast`).
//   category   exact: `tap-target` | `text-floor` | `h-scroll` | `a11y`.
//   match      substring or RegExp against "<el description> <detail>".
//   selector   substring or RegExp against the finding's `hint` plus, for an
//              a11y finding, the raw axe target selectors. This is the a11y
//              shape: `{ rule: 'color-contrast', selector: '[data-geek-x]' }`.
//   scenes     narrows the waiver to named scenes.
//
// Waivers exist so a known, ticketed violation does not hold the gate shut —
// every one of them carries a reason and should die when the app is fixed.
export function partition(violations, waivers = [], sceneName) {
  const open = [];
  const waived = [];
  const hits = (pattern, hay) => (pattern instanceof RegExp ? pattern.test(hay) : hay.includes(pattern));
  for (const v of violations) {
    const hit = waivers.find((w) => {
      let qualified = false; // did this waiver actually assert anything?
      if (w.scenes && !w.scenes.includes(sceneName)) return false;
      if (w.category) {
        if (w.category !== (v.category || v.rule)) return false;
        qualified = true;
      }
      if (w.rule) {
        if (w.rule !== v.rule) return false;
        qualified = true;
      }
      if (w.match != null) {
        if (!hits(w.match, `${v.el} ${v.detail}`)) return false;
        qualified = true;
      }
      if (w.selector != null) {
        if (!hits(w.selector, [v.hint, ...(v.targets || [])].join(' '))) return false;
        qualified = true;
      }
      return qualified;
    });
    if (hit) waived.push({ ...v, why: hit.why });
    else open.push(v);
  }
  return { open, waived };
}

export const isA11y = (v) => (v.category || v.rule) === 'a11y';

export { GRAMMAR_RULES, CATEGORIES };
