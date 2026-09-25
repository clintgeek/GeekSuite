import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { useEffect } from 'react';
import { ThemeProvider, useThemeMode } from '../ThemeProvider.jsx';
import { configure, useUser } from '../useUserStore.js';

// A fake basegeek: bootstrap returns the account's stored theme, PATCH echoes
// what it was sent (like the real /users/preferences). Every PATCH is recorded.
function fakeApi(storedTheme) {
  const patches = [];
  let theme = storedTheme;
  return {
    patches,
    get: async () => ({ data: { identity: {}, profile: {}, preferences: theme ? { theme } : {}, appPreferences: {} } }),
    patch: async (_url, body) => {
      patches.push(body.theme);
      theme = body.theme;
      return { data: { preferences: { theme } } };
    },
  };
}

let ctl;
let resetStore = () => {};
function Probe() {
  const { bootstrap, reset } = useUser();
  resetStore = reset;
  ctl = useThemeMode();
  useEffect(() => { bootstrap().catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

const settle = () => act(() => new Promise((r) => setTimeout(r, 150)));

function setCookie(value) {
  document.cookie = `geek_theme=${value}; Path=/`;
}

beforeEach(() => {
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
});
afterEach(() => {
  act(() => resetStore()); // the store is module-global; each test starts unloaded
  cleanup();
  document.cookie = 'geek_theme=; Path=/; Max-Age=0';
});

describe('ThemeProvider account sync', () => {
  it('adopts the account value when the cookie disagrees, without PATCHing (the flicker loop)', async () => {
    const api = fakeApi('system');
    configure(api);
    setCookie('dark');
    render(<ThemeProvider><Probe /></ThemeProvider>);
    await settle();
    expect(api.patches).toEqual([]);
    expect(ctl.themePreference).toBe('auto');
    expect(ctl.theme).toBe('light');
    expect(document.cookie).toContain('geek_theme=auto');
  });

  it('seeds a fresh account with the browser value exactly once', async () => {
    const api = fakeApi(null);
    configure(api);
    setCookie('dark');
    render(<ThemeProvider><Probe /></ThemeProvider>);
    await settle();
    expect(api.patches).toEqual(['dark']);
    expect(ctl.theme).toBe('dark');
  });

  it('a toggle PATCHes once and does not echo back', async () => {
    const api = fakeApi('light');
    configure(api);
    render(<ThemeProvider><Probe /></ThemeProvider>);
    await settle();
    await act(async () => { ctl.toggleTheme(); });
    await settle();
    expect(api.patches).toEqual(['dark']);
    expect(ctl.theme).toBe('dark');
  });

  it('settings pick of "auto" is stored as "system"', async () => {
    const api = fakeApi('dark');
    configure(api);
    render(<ThemeProvider><Probe /></ThemeProvider>);
    await settle();
    await act(async () => { ctl.setThemePreference('auto'); });
    await settle();
    expect(api.patches).toEqual(['system']);
    expect(ctl.themePreference).toBe('auto');
  });
});
