/**
 * Mobile theme rules (DOCS/MOBILE_UI_PLAN.md §2), read off the built theme so
 * an app that retunes its own overrides is held to the same rules.
 */
import { describe, expect, it } from 'vitest';
import { createGeekSuiteTheme } from '../createGeekSuiteTheme.js';
import { geekLayout } from '../designTokens.js';

describe('mobile theme rules', () => {
  const theme = createGeekSuiteTheme({ mode: 'light' });

  it('lifts inputs to 16px below sm so iOS does not zoom on focus', () => {
    const input = theme.components.MuiInputBase.styleOverrides.input;
    const rule = input[`@media (max-width:${geekLayout.phoneMaxWidth}px)`];
    expect(rule).toBeDefined();
    expect(rule.fontSize).toBe('1rem');
    expect(geekLayout.phoneMaxWidth).toBeLessThan(theme.breakpoints.values.sm);
  });

  it('forces hover-revealed actions visible on devices with no hover', () => {
    const baseline = theme.components.MuiCssBaseline.styleOverrides;
    const rule = baseline['@media (hover: none)']['[data-geek-hover-reveal]'];
    expect(rule.opacity).toContain('1');
    expect(rule.visibility).toContain('visible');
  });

  it('scopes the 220px drawer width to left-anchored drawers so bottom sheets span the viewport', () => {
    const drawer = theme.components.MuiDrawer.styleOverrides;
    expect(drawer.paper.width).toBeUndefined();
    expect(drawer.paperAnchorLeft.width).toBe(geekLayout.sidebarWidth);
  });

  it('keeps the shared 44px target and 12px caption floor', () => {
    expect(theme.components.MuiButton.styleOverrides.root.minHeight).toBe(44);
    expect(theme.components.MuiChip.styleOverrides.root.fontSize).toBe('0.75rem');
  });
});
