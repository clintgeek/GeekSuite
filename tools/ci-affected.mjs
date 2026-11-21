#!/usr/bin/env node
// Which apps does a push touch? One answer for the three workflows, so a
// ThingGeek-only push runs ThingGeek's tests, one harness shard and one image
// instead of everything (2026-11-18: "This build is simply too long").
//
//   node tools/ci-affected.mjs --for ci|harness|release [--base <sha>]
//
// Prints GitHub outputs (`all=`, `apps=`, and for ci `matrix=`). With no
// usable --base it answers "everything": the filter may only ever skip work
// it can prove is unaffected.
//
// The base is the head of the last SUCCESSFUL run of the same workflow, not
// the push's `before`: a cancelled or red run has tested nothing, so the next
// one must cover its changes too.
//
// The rules, per changed file:
//   docs (*.md, DOCS/)                     -> nothing
//   apps/<app>/...                         -> that app
//   tools/mobile-harness/apps/<app>/...    -> that app (its scenes/fixtures)
//   a path the consumer does not read      -> nothing (IGNORES below)
//   anything else (packages/, lockfile...) -> everything
//
// Apps are NOT fully independent, which is why `ci` is the cautious one:
//   - basegeek's api suite reads other apps' files (gatewayInputObjectParity,
//     the schema parity tests), so basegeek is ALWAYS in the ci matrix;
//   - other apps' tests read basegeek (bookgeek sharedSchema, the backend
//     auth tests), so a basegeek change runs every app's tests;
//   - packages/ui's themeContrast reads the apps' themes, so the shared
//     package job in ci.yml always runs (it is not in this matrix).
// An image only COPYs its own app, packages/ and the root manifests, and a
// harness shard only builds its own app, so those two take the plain rule.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** Every app's CI steps. `be`/`fe` are test dirs; `web` is what gets built and PWA-audited. */
export const CI_APPS = [
  {
    app: 'basegeek',
    be: 'apps/basegeek/packages/api',
    be_cmd: 'node --experimental-vm-modules node_modules/jest/bin/jest.js --forceExit',
    mongo: 'mongodb-binaries-7.0.14',
    fe: 'apps/basegeek/packages/ui',
    web: 'apps/basegeek/packages/ui',
  },
  { app: 'bookgeek', be: 'apps/bookgeek/api', be_cmd: 'npm test', fe: 'apps/bookgeek/web', web: 'apps/bookgeek/web' },
  { app: 'gamegeek', be: 'apps/gamegeek/backend', be_cmd: 'npm test', fe: 'apps/gamegeek/frontend', web: 'apps/gamegeek/frontend' },
  { app: 'thinggeek', be: 'apps/thinggeek/backend', be_cmd: 'npm test', fe: 'apps/thinggeek/frontend', web: 'apps/thinggeek/frontend' },
  { app: 'geekday', be: 'apps/geekday/backend', be_cmd: 'npm test', fe: 'apps/geekday/frontend', web: 'apps/geekday/frontend' },
  {
    app: 'newsgeek',
    be: 'apps/newsgeek/backend',
    be_cmd: 'npm test',
    mongo: 'mongodb-binaries-7.0.24-ubuntu2204',
    fe: 'apps/newsgeek/frontend',
    web: 'apps/newsgeek/frontend',
  },
  ...['fitnessgeek', 'todogeek', 'notegeek', 'flockgeek', 'storygeek'].map((app) => ({
    app,
    be: `apps/${app}/backend`,
    be_cmd: 'pnpm test',
    mongo: 'mongodb-binaries-7.0.14-ubuntu2204',
    fe: `apps/${app}/frontend`,
    web: `apps/${app}/frontend`,
  })),
  { app: 'startgeek', be: 'apps/startgeek', be_cmd: 'pnpm test', fe: '', web: 'apps/startgeek' },
].map((row) => ({ mongo: '', ...row }));

export const APP_NAMES = CI_APPS.map((a) => a.app);

const isDoc = (f) => f.endsWith('.md') || f.startsWith('DOCS/') || f.includes('/DOCS/') || f === 'LICENSE';

// Paths a consumer does not read. A file matching one of these changes
// nothing for that consumer; everything not listed (and not under an app)
// means "everything".
const IGNORES = {
  // The app matrix runs tests and a build. The static and shared-package
  // jobs always run, so tooling outside an app is theirs, not the matrix's.
  ci: [/^tools\/mobile-harness\//, /^\.github\/workflows\/(mobile-harness|release)\.yml$/],
  harness: [/^tools\/(?!mobile-harness\/)/, /^\.github\/workflows\/(ci|release)\.yml$/],
  // No Dockerfile copies tools/ or .github/.
  release: [/^tools\//, /^\.github\/workflows\/(ci|mobile-harness)\.yml$/],
};

/**
 * @param {string[]|null} files changed paths, or null when unknown
 * @param {'ci'|'harness'|'release'} consumer
 * @returns {{ all: boolean, apps: string[] }}
 */
export function affected(files, consumer) {
  if (!IGNORES[consumer]) throw new Error(`unknown consumer "${consumer}"`);
  const everything = { all: true, apps: [...APP_NAMES] };
  if (!files) return everything;
  const hit = new Set();
  for (const f of files) {
    if (!f || isDoc(f)) continue;
    const own = f.match(/^apps\/([^/]+)\//) || f.match(/^tools\/mobile-harness\/apps\/([^/]+)\//);
    if (own) {
      // An app this table does not know is not something to guess about.
      if (!APP_NAMES.includes(own[1])) return everything;
      hit.add(own[1]);
      continue;
    }
    if (IGNORES[consumer].some((re) => re.test(f))) continue;
    return everything;
  }
  if (consumer === 'ci') {
    if (hit.has('basegeek')) return everything;
    hit.add('basegeek');
  }
  return { all: false, apps: APP_NAMES.filter((a) => hit.has(a)) };
}

/** Changed paths between `base` and HEAD, or null when that cannot be known. */
export function changedFiles(base) {
  if (!base || /^0+$/.test(base)) return null;
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  try {
    try {
      git('cat-file', '-e', `${base}^{commit}`);
    } catch {
      git('fetch', '--no-tags', '--depth=1', 'origin', base);
    }
    return git('diff', '--name-only', base, 'HEAD').split('\n').filter(Boolean);
  } catch {
    return null;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const arg = (name) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > -1 ? process.argv[i + 1] : '';
  };
  const consumer = arg('for');
  const base = arg('base');
  const files = changedFiles(base);
  const result = affected(files, consumer);
  console.error(
    `ci-affected (${consumer}): base=${base || '(none)'} files=${files ? files.length : 'unknown'} -> ` +
      (result.all ? 'everything' : result.apps.join(', ') || 'nothing'),
  );
  console.log(`all=${result.all}`);
  console.log(`apps=${JSON.stringify(result.apps)}`);
  if (consumer === 'ci') console.log(`matrix=${JSON.stringify(CI_APPS.filter((a) => result.apps.includes(a.app)))}`);
}
