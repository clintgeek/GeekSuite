import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { gql } from '@apollo/client';
import { MockedProvider } from '@apollo/client/testing';
import { ThemeProvider } from '@mui/material/styles';
import { lightTheme } from '../testUtils';
import { TagsPanel } from '../../components/Sidebar';
import ThemeModeProvider from '../../theme/ThemeModeProvider';

/**
 * Tablet wave 2026-11-16, pointer targets. The tablet baseline found ~5,000
 * tap-target hits in landscape from a few dozen controls: the tag tree's
 * 24x24 collapse and ⋯ buttons and its 32 px rows, which were 44 only below
 * `md` (900 px) — so a 1280 px TOUCH tablet got the mouse sizes. They are
 * sized by the pointer now: 44 by default (a finger), compact only under
 * `(pointer: fine)`.
 *
 * jsdom evaluates no @media, so these read the CSS emotion wrote: the rule
 * for the element's class OUTSIDE any media query is what a finger gets.
 */
function allCss() {
  return [...document.querySelectorAll('style')].map((s) => s.textContent).join('\n');
}
/** The declarations for `.cls` that are not inside an @media block. */
function baseRule(el) {
  const cls = [...el.classList].filter((c) => c.startsWith('css-')).pop();
  const css = allCss();
  let depth = 0;
  let media = false;
  let out = '';
  // Walk the stylesheet text, tracking whether we are inside @media { … }.
  const re = /(@media[^{]*\{)|([^{}]+)\{([^{}]*)\}|(\})/g;
  let m;
  while ((m = re.exec(css))) {
    if (m[1]) { media = true; depth += 1; continue; }
    if (m[4]) { depth -= 1; if (depth <= 0) { media = false; depth = 0; } continue; }
    if (!media && m[2] && m[2].includes(`.${cls}`)) out += m[3];
  }
  return out;
}

const GET_TAGS = gql`query GetNoteTags { noteTags }`;
const GET_TAG_COUNTS = gql`query GetNoteTagCounts { notes { id tags } }`;
const mocks = [
  { request: { query: GET_TAGS }, result: { data: { noteTags: ['house', 'house/garage'] } } },
  { request: { query: GET_TAG_COUNTS }, result: { data: { notes: [{ id: 'n1', tags: ['house/garage'] }] } } },
];

vi.mock('../../components/TagContextMenu', () => ({ default: () => null }));
vi.mock('@geeksuite/user', () => ({
  ThemeProvider: ({ children }) => children,
  useThemeMode: () => ({ theme: 'light', themePreference: 'light', setThemePreference: vi.fn(), toggleTheme: vi.fn() }),
  usePreferences: vi.fn(() => ({ preferences: {}, loaded: true })),
}));

describe('tag tree targets are sized by the pointer', () => {
  it('collapse and ⋯ buttons are 44 px for a finger at any width, 24 only with a mouse', async () => {
    render(
      <ThemeProvider theme={lightTheme}>
        <MockedProvider mocks={mocks} addTypename={false}>
          <MemoryRouter><TagsPanel /></MemoryRouter>
        </MockedProvider>
      </ThemeProvider>
    );
    const toggle = await screen.findByRole('button', { name: 'Collapse house' });
    const more = screen.getByRole('button', { name: 'Tag options for house' });
    for (const el of [toggle, more]) {
      const base = baseRule(el);
      expect(base).toMatch(/min-height:44px/);
      expect(base).toMatch(/min-width:44px/);
      expect(allCss()).toMatch(/@media \(pointer: fine\)\{[^}]*min-height:24px/);
    }
  });
});

describe('form fields keep their 44 px floor on a touch tablet', () => {
  it('the "compact inputs" override applies to a mouse only, not to every window over 600 px', () => {
    render(<ThemeModeProvider><div /></ThemeModeProvider>);
    const css = allCss();
    const at = css.indexOf('min-height:auto!important');
    expect(at).toBeGreaterThan(-1);
    const mediaStart = css.lastIndexOf('@media', at);
    const media = css.slice(mediaStart, css.indexOf('{', mediaStart));
    expect(media).toMatch(/pointer: ?fine/);
  });
});
