/**
 * Tablet-width surfaces (tablet baseline 2026-11-15, "Fix first" 2, 3, 8):
 *   - `geekMedia.tabletUp` says "not a phone" by the same rule as
 *     classifyFormFactor, at every harness viewport;
 *   - GeekSheet caps and centres its sheet paper from tabletUp, leaves the
 *     phone markup's base rules alone, keeps the full-snap close button;
 *   - GeekContentColumn caps and centres from tabletUp, relative to its
 *     parent (so the rail's inset is already outside it);
 *   - geekTarget: 44 px unless the pointer is fine.
 *
 * `node` environment, server markup, literal emotion CSS — as sheet.test.jsx.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  GEEK_COARSE_TARGET,
  GEEK_CONTENT_COLUMN_MAX_WIDTH,
  GEEK_SHEET_TABLET_MAX_WIDTH,
  GeekContentColumn,
  GeekSheet,
  classifyFormFactor,
  geekLayout,
  geekMedia,
  geekTarget,
} from '../index.js';
import { VIEWPORTS, matchesQuery } from './helpers/viewport.js';

const TABLET_UP = geekMedia.tabletUp.replace(/^@media\s*/, '').replace(/,\s*/g, ',');

/** Every declaration block emotion wrote under the tabletUp query. */
function tabletBlocks(html) {
  const blocks = [];
  let at = html.indexOf(TABLET_UP);
  while (at !== -1) {
    const open = html.indexOf('{', at);
    let depth = 0;
    let end = open;
    for (; end < html.length; end += 1) {
      if (html[end] === '{') depth += 1;
      else if (html[end] === '}' && --depth === 0) break;
    }
    blocks.push(html.slice(open, end + 1));
    at = html.indexOf(TABLET_UP, end);
  }
  return blocks;
}

/** CSS with every tabletUp block removed: what a phone sees. */
function withoutTabletBlocks(html) {
  let out = html;
  for (const block of tabletBlocks(html)) out = out.replace(`@media ${TABLET_UP}${block}`, '');
  return out;
}

const sheet = (props) =>
  renderToStaticMarkup(
    <GeekSheet open onClose={() => {}} title="Filter" mode="sheet" {...props}>
      <p>Body</p>
    </GeekSheet>
  );

describe('geekMedia.tabletUp', () => {
  it.each(Object.entries(VIEWPORTS))('%s: matches exactly when the device is not a phone', (_name, vp) => {
    expect(matchesQuery(geekMedia.tabletUp, vp)).toBe(!classifyFormFactor(vp).phone);
  });

  it('a mouse in a short wide window is still not a phone (desktop 1280x500)', () => {
    const vp = { width: 1280, height: 500, fine: true };
    expect(matchesQuery(geekMedia.tabletUp, vp)).toBe(true);
    expect(classifyFormFactor(vp).phone).toBe(false);
  });
});

describe('GeekSheet at tablet width', () => {
  it('caps and centres the sheet paper at 600 px by default', () => {
    const blocks = tabletBlocks(sheet()).join('');
    expect(GEEK_SHEET_TABLET_MAX_WIDTH).toBe(600);
    expect(blocks).toContain('max-width:600px');
    expect(blocks).toContain('margin-left:auto');
    expect(blocks).toContain('margin-right:auto');
    expect(blocks).toContain('border-radius:16px 16px 0 0');
  });

  it('takes the cap from `tabletMaxWidth`, and `false` keeps the full-width sheet', () => {
    expect(tabletBlocks(sheet({ tabletMaxWidth: 560 })).join('')).toContain('max-width:560px');
    expect(tabletBlocks(sheet({ tabletMaxWidth: false }))).toEqual([]);
  });

  it('leaves the phone rules exactly as they were (only a tabletUp block is added)', () => {
    for (const snap of ['content', 'full']) {
      const capped = withoutTabletBlocks(sheet({ snap }));
      const plain = sheet({ snap, tabletMaxWidth: false });
      // Class names hash the styles, so compare the CSS text with hashes removed.
      const strip = (html) => html.replace(/css[- ][a-z0-9]+/g, 'css-x');
      expect(strip(capped)).toBe(strip(plain));
    }
  });

  it('a full-snap sheet stops 16 px short of the top on a tablet; its close button keeps zIndex 2', () => {
    const html = sheet({ snap: 'full' });
    const blocks = tabletBlocks(html).join('');
    expect(blocks).toContain('height:calc(100vh - 16px)');
    expect(blocks).toContain('height:calc(100dvh - 16px)');
    expect(html).toContain('data-geek-sheet="close"');
    expect(html).toMatch(/z-index:2/);
  });

  it('is still the anchored bottom sheet: handle, same root and mode', () => {
    const html = sheet();
    expect(html).toContain('data-geek-sheet-mode="sheet"');
    expect(html).toContain('data-geek-sheet="handle"');
    expect(html).toContain('MuiDrawer-paperAnchorBottom');
  });

  it('dialog mode (desktop, md and up) is untouched', () => {
    const html = sheet({ mode: 'dialog' });
    expect(tabletBlocks(html)).toEqual([]);
  });
});

describe('GeekContentColumn', () => {
  const column = (props) => renderToStaticMarkup(<GeekContentColumn {...props}>rows</GeekContentColumn>);

  it('is full width on a phone and capped at 680 px, centred, from tabletUp', () => {
    const html = column();
    expect(GEEK_CONTENT_COLUMN_MAX_WIDTH).toBe(680);
    expect(withoutTabletBlocks(html)).not.toContain('max-width');
    expect(withoutTabletBlocks(html)).toContain('width:100%');
    const blocks = tabletBlocks(html).join('');
    expect(blocks).toContain('max-width:680px');
    expect(blocks).toContain('margin-left:auto');
    expect(blocks).toContain('margin-right:auto');
  });

  it('takes `maxWidth`, turns off with `false`, and sets the element', () => {
    expect(tabletBlocks(column({ maxWidth: 600 })).join('')).toContain('max-width:600px');
    expect(tabletBlocks(column({ maxWidth: false }))).toEqual([]);
    expect(column({ component: 'main' })).toMatch(/^<style[^>]*>.*<\/style><main /);
  });

  it('centres in its parent, never on the viewport (so a rail beside it is already outside)', () => {
    const html = column();
    expect(html).not.toMatch(/\dvw|[{;]left:|position:/);
  });
});

describe('geekTarget', () => {
  it('is 44 px by default and compact only under a fine pointer', () => {
    expect(GEEK_COARSE_TARGET).toBe(geekLayout.minClickTarget);
    expect(geekTarget()).toEqual({ minHeight: 44, [geekMedia.fine]: { minHeight: 32 } });
  });

  it('takes sizes and can size the width too', () => {
    expect(geekTarget({ fine: 24, both: true })).toEqual({
      minHeight: 44,
      minWidth: 44,
      [geekMedia.fine]: { minHeight: 24, minWidth: 24 },
    });
    expect(geekTarget({ fine: 34, coarse: 48 })).toEqual({ minHeight: 48, [geekMedia.fine]: { minHeight: 34 } });
  });

  it('renders as CSS a coarse pointer never matches', () => {
    const html = renderToStaticMarkup(<GeekContentColumn sx={geekTarget({ fine: 24 })}>x</GeekContentColumn>);
    expect(html).toContain('min-height:44px');
    expect(html).toContain('@media (pointer: fine){');
    expect(matchesQuery(geekMedia.fine, VIEWPORTS.tabletPortrait)).toBe(false);
    expect(matchesQuery(geekMedia.fine, VIEWPORTS.desktop)).toBe(true);
  });
});
