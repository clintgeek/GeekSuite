import { themePrebootScript } from './themePreboot.js';

/**
 * Vite plugin that injects the shared GeekSuite theme-preboot script into
 * every app's index.html — so the `geek_theme` cookie is applied to
 * `<html data-theme>` before React mounts. Single source of truth; apps
 * don't maintain their own copy of the snippet.
 *
 * Usage (in an app's vite.config.js):
 *   import { themePreboot } from '@geeksuite/user/vite';
 *   export default defineConfig({ plugins: [react(), themePreboot()] });
 */
export function themePreboot() {
  return {
    name: 'geeksuite-theme-preboot',
    transformIndexHtml: {
      order: 'pre',
      handler() {
        return [
          {
            tag: 'script',
            attrs: { 'data-geeksuite-theme-preboot': '' },
            children: themePrebootScript,
            injectTo: 'head-prepend',
          },
        ];
      },
    },
  };
}
