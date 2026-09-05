// The mobile-grammar probe — the CI gate for MOBILE_UI_PLAN.md §6.
//
// Three rules, all measured in the live page at 390x844:
//   tap-target  every visible interactive element is at least 44x44
//   text-floor  no visible readable string below 12px
//   h-scroll    the document does not scroll sideways
//
// It runs in the page, so it sees computed styles rather than source. That
// catches the whole class of "the sx says 44 but a parent squeezed it".

const RULES = ['tap-target', 'text-floor', 'h-scroll'];

const collect = () => {
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

  // ── tap-target ──────────────────────────────────────────────────────────
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
    if (w < 43.5 || h < 43.5) {
      violations.push({
        rule: 'tap-target',
        el: describe(el),
        detail: `${Math.round(w)}x${Math.round(h)}`,
      });
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
        el: describe(el),
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
      el: worst ? describe(worst.el) : 'document',
      detail: `scrollWidth ${doc.scrollWidth} > clientWidth ${doc.clientWidth}`,
    });
  }

  return violations;
};

export async function probePage(page) {
  return page.evaluate(collect);
}

// A waiver is { rule, match, why, scenes? }. `match` is a string (substring)
// or a RegExp tested against the element description. Waivers exist so a
// known, ticketed violation does not hold the gate shut — every one of them
// carries a reason and should die when the app is fixed.
export function partition(violations, waivers = [], sceneName) {
  const open = [];
  const waived = [];
  for (const v of violations) {
    const hit = waivers.find((w) => {
      if (w.rule && w.rule !== v.rule) return false;
      if (w.scenes && !w.scenes.includes(sceneName)) return false;
      const hay = `${v.el} ${v.detail}`;
      return w.match instanceof RegExp ? w.match.test(hay) : hay.includes(w.match);
    });
    if (hit) waived.push({ ...v, why: hit.why });
    else open.push(v);
  }
  return { open, waived };
}

export { RULES };
