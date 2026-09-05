// The eight apps, where they build, and where their dev server usually lives.
//
// `build` is what CI runs before serving `dist`. startgeek is the odd one:
// it is a standalone Tailwind console with its own npm scripts (same rule the
// frontend build smoke job in ci.yml follows).
export const APPS = {
  bookgeek: { dir: 'apps/bookgeek/web', pkg: 'bookgeek-web', pm: 'pnpm', devBase: 'http://localhost:1801' },
  fitnessgeek: { dir: 'apps/fitnessgeek/frontend', pkg: 'fitnessgeek-frontend', pm: 'pnpm', devBase: 'http://localhost:1821' },
  bujogeek: { dir: 'apps/bujogeek/frontend', pkg: 'bujogeek-client', pm: 'pnpm', devBase: 'http://localhost:1851' },
  notegeek: { dir: 'apps/notegeek/frontend', pkg: 'notegeek-frontend', pm: 'pnpm', devBase: 'http://localhost:1861' },
  flockgeek: { dir: 'apps/flockgeek/frontend', pkg: 'flockgeek-frontend', pm: 'pnpm', devBase: 'http://localhost:1901' },
  storygeek: { dir: 'apps/storygeek/frontend', pkg: 'storygeek-frontend', pm: 'pnpm', devBase: 'http://localhost:1871' },
  basegeek: { dir: 'apps/basegeek/packages/ui', pkg: '@basegeek/ui', pm: 'pnpm', devBase: 'http://localhost:5173' },
  startgeek: { dir: 'apps/startgeek', pkg: 'startgeek', pm: 'npm', devBase: 'http://localhost:1891' },
};

export const APP_NAMES = Object.keys(APPS);
export const appSpec = (name) => {
  const spec = APPS[name];
  if (!spec) throw new Error(`unknown app "${name}" (have: ${APP_NAMES.join(', ')})`);
  return { name, ...spec };
};
