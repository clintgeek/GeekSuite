/**
 * Contained buttons darken to THEIR OWN colour on hover and on press.
 *
 * The shared override used to paint every contained button `primary.dark` on
 * :hover/:active, so ThingGeek Walk's `color="safety"` save washed out to the
 * accent on the first tap (SUITE_TODO, 2026-09-29). These render the real MUI
 * Button through `renderToStaticMarkup` (this package runs in `node`; emotion
 * inlines its <style> tags under SSR) and read the CSS emotion generated for
 * the button's class, so they hold what MUI actually applies — not just what
 * the override object says.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Button from '@mui/material/Button';
import { ThemeProvider, getContrastRatio } from '@mui/material/styles';

import { createGeekSuiteTheme } from '../createGeekSuiteTheme.js';
import { flattenOver } from '../color.js';

/** The declarations of `.<class>:<state>{...}` for the rendered button. */
function stateRule(markup, state) {
  const cls = markup.match(/<button[^>]*class="([^"]*)"/)[1]
    .split(/\s+/)
    .find((c) => /^css-/.test(c));
  const css = [...markup.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('');
  const re = new RegExp(`\\.${cls}:${state}\\{([^}]*)\\}`, 'g');
  return [...css.matchAll(re)].map((m) => m[1]).join(';');
}

function bgOf(declarations) {
  const all = [...declarations.matchAll(/background-color:([^;]+)/g)].map((m) => m[1].trim());
  return all.at(-1);
}

function render(theme, props) {
  return renderToStaticMarkup(
    <ThemeProvider theme={theme}>
      <Button variant="contained" {...props}>Save</Button>
    </ThemeProvider>
  );
}

describe('contained button hover/press colour', () => {
  const theme = createGeekSuiteTheme({
    mode: 'light',
    overrides: {
      palette: {
        // A custom colour an app registers, the way ThingGeek adds `safety`.
        safety: { main: '#F26B1D', dark: '#B84A0C', light: '#F7A06E', contrastText: '#FFFFFF' },
      },
    },
  });

  it.each([
    ['primary', theme.palette.primary.dark],
    ['secondary', theme.palette.secondary.dark],
    ['error', theme.palette.error.dark],
    ['success', theme.palette.success.dark],
    ['safety', '#B84A0C'],
  ])('color="%s" hovers and presses to its own .dark', (color, dark) => {
    const markup = render(theme, { color });
    expect(bgOf(stateRule(markup, 'hover'))).toBe(dark);
    expect(bgOf(stateRule(markup, 'active'))).toBe(dark);
  });

  it('error does not wash out to primary', () => {
    expect(theme.palette.error.dark).not.toBe(theme.palette.primary.dark);
    expect(bgOf(stateRule(render(theme, { color: 'error' }), 'hover'))).not.toBe(theme.palette.primary.dark);
  });

  it('primary keeps the flat, primary.dark treatment', () => {
    const markup = render(theme, {});
    expect(bgOf(stateRule(markup, 'hover'))).toBe(theme.palette.primary.dark);
    expect(stateRule(markup, 'hover')).toMatch(/box-shadow:none/);
  });

  it('a dark-mode semantic colour presses LIGHTER when darkening would sink its dark label below AA', () => {
    const dark = createGeekSuiteTheme({ mode: 'dark' });
    const { error } = dark.palette;
    const labelOn = (fill) => getContrastRatio(flattenOver(error.contrastText, fill), fill);
    // The premise: MUI's error.dark would take the label under 4.5:1.
    expect(labelOn(error.dark)).toBeLessThan(4.5);
    const markup = render(dark, { color: 'error' });
    const fill = bgOf(stateRule(markup, 'active'));
    expect(fill).toBe(error.light);
    expect(labelOn(fill)).toBeGreaterThanOrEqual(4.5);
  });

  it('an app extending `contained` with an object keeps the colour-aware hover', () => {
    const extended = createGeekSuiteTheme({
      mode: 'light',
      overrides: {
        components: {
          MuiButton: {
            styleOverrides: {
              contained: { border: '2px solid #000', '&:hover': { outline: '1px solid red' } },
            },
          },
        },
      },
    });
    const markup = render(extended, { color: 'error' });
    const hover = stateRule(markup, 'hover');
    expect(bgOf(hover)).toBe(extended.palette.error.dark);
    expect(hover).toMatch(/outline:1px solid red/);
  });
});
