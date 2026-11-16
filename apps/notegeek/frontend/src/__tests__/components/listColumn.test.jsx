import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { createNoteTheme } from '../../theme/createAppTheme';
import ListColumn from '../../components/notes/ListColumn';
import { VIEWPORTS, setViewport, restoreViewport } from '../helpers/viewport';

/**
 * Tablet baseline "Fix first" 2: at 800 px the notes list ran its rows ~700 px
 * wide with "2h ago" at the far edge. ListColumn (GeekContentColumn) caps a
 * list page at 600 px on a tablet and keeps the desktop's 720.
 *
 * jsdom does not evaluate @media, so this reads the rule emotion wrote for
 * the column's class: the cap sits inside GeekContentColumn's `tabletUp` query.
 */
function capFor(el) {
  const cls = [...el.classList].find((c) => c.startsWith('css-'));
  const css = [...document.querySelectorAll('style')].map((s) => s.textContent).join('\n');
  const rules = css.split('}').filter((r) => r.includes(`.${cls}`) && r.includes('max-width:'));
  const m = rules.map((r) => /max-width:(\d+)px/.exec(r)).find(Boolean);
  return m ? Number(m[1]) : null;
}

function renderColumn() {
  render(
    <ThemeProvider theme={createNoteTheme('light')}>
      <ListColumn data-testid="col">rows</ListColumn>
    </ThemeProvider>
  );
  return screen.getByTestId('col');
}

afterEach(() => restoreViewport());

describe('ListColumn', () => {
  it.each([
    ['portrait tablet', VIEWPORTS.tabletPortrait],
    ['landscape tablet', VIEWPORTS.tabletLandscape],
  ])('caps a list at 600 px on a %s', (_n, vp) => {
    setViewport(vp);
    const col = renderColumn();
    expect(col).toHaveAttribute('data-list-column', 'tablet');
    expect(capFor(col)).toBe(600);
  });

  it('keeps the desktop column at 720 px', () => {
    setViewport(VIEWPORTS.desktop);
    const col = renderColumn();
    expect(capFor(col)).toBe(720);
  });
});
