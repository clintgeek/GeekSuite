import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppThemeProvider, useColorMode } from '../../theme/AppThemeProvider';

/**
 * DOCS/SUITE_TODO.md "flockgeek first-visit flicker": a cookie-less visitor
 * on a light OS used to see the app paint light (the preboot script's
 * `prefers-color-scheme` guess, before React mounts) then flip to dark the
 * instant this provider mounted, because it hardcoded `defaultPreference="dark"`
 * — disagreeing with preboot, which always assumes 'auto' when there's no
 * `geek_theme` cookie. bujogeek and notegeek never override this prop, so
 * they never disagree with preboot; this locks flockgeek to the same rule.
 *
 * The test setup's global `matchMedia` mock always reports
 * `matches: false` (src/test/setup.js), i.e. "no dark preference" — a light
 * OS — which is exactly the reproduction case.
 */
function Probe() {
  const { mode } = useColorMode();
  return <div data-testid="resolved-mode">{mode}</div>;
}

describe('AppThemeProvider — first-visit theme resolution', () => {
  it('resolves to the OS preference (light) for a cookie-less visitor, not a hardcoded dark default', () => {
    // No `geek_theme` cookie set — simulates a first-time visitor.
    expect(document.cookie).not.toMatch(/geek_theme/);

    render(
      <AppThemeProvider>
        <Probe />
      </AppThemeProvider>
    );

    expect(screen.getByTestId('resolved-mode')).toHaveTextContent('light');
  });
});
