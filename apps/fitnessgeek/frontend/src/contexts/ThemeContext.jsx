// Shim around the shared theme provider in @geeksuite/user, so existing
// fitnessgeek imports (`useTheme`, `ThemeProvider`) keep working while the
// theme is shared cross-suite via the `geek_theme` cookie.
export { ThemeProvider, useThemeMode as useTheme } from '@geeksuite/user';
