/**
 * The truck's black flank: the top bar, the phone tab bar and the desktop
 * sidebar render under this nested theme in BOTH modes (the Storage Yard's black
 * livery), so every shared primitive inside them — the avatar menu, the
 * search field, the sidebar's captions — picks up light-on-black ink without
 * restyling the shared packages.
 */
import React, { useMemo } from 'react';
import { ThemeProvider, useTheme } from '@mui/material/styles';
import { createThingTheme } from '../theme/theme';

export default function ChromeTheme({ children }) {
  const outer = useTheme();
  const mode = outer.palette.mode === 'dark' ? 'dark' : 'light';
  const chrome = useMemo(() => createThingTheme(mode, { chrome: true }), [mode]);
  return <ThemeProvider theme={chrome}>{children}</ThemeProvider>;
}
