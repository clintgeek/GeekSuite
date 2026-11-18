import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { affected, APP_NAMES, CI_APPS } from './ci-affected.mjs';
import { APP_NAMES as HARNESS_APPS } from './mobile-harness/lib/registry.mjs';

const apps = (files, consumer) => affected(files, consumer).apps;

test('an unknown base means everything, for every consumer', () => {
  for (const c of ['ci', 'harness', 'release']) assert.deepEqual(affected(null, c), { all: true, apps: APP_NAMES });
});

test('one app changed: that app alone for the image and the harness', () => {
  const files = ['apps/thinggeek/frontend/src/App.jsx'];
  assert.deepEqual(affected(files, 'release'), { all: false, apps: ['thinggeek'] });
  assert.deepEqual(affected(files, 'harness'), { all: false, apps: ['thinggeek'] });
});

test('ci always keeps basegeek: its api suite reads the other apps', () => {
  assert.deepEqual(apps(['apps/thinggeek/backend/src/x.js'], 'ci'), ['basegeek', 'thinggeek']);
});

test('a basegeek change runs every app in ci, but builds one image', () => {
  const files = ['apps/basegeek/packages/api/src/graphql/x.js'];
  assert.equal(affected(files, 'ci').all, true);
  assert.deepEqual(apps(files, 'release'), ['basegeek']);
});

test('a shared package, the lockfile or a root manifest means everything', () => {
  for (const f of ['packages/ui/src/index.js', 'pnpm-lock.yaml', 'package.json', '.npmrc', 'pnpm-workspace.yaml']) {
    for (const c of ['ci', 'harness', 'release']) assert.equal(affected([f, 'apps/todogeek/a.js'], c).all, true, `${f} ${c}`);
  }
});

test('docs change nothing', () => {
  const files = ['DOCS/WORK_LOG.md', 'apps/notegeek/DOCS/plan.md', 'apps/notegeek/README.md', 'apps/todogeek/frontend/a.js'];
  assert.deepEqual(apps(files, 'release'), ['todogeek']);
});

test('harness tooling rebuilds no image and runs every shard', () => {
  const files = ['tools/mobile-harness/lib/runner.mjs', '.github/workflows/mobile-harness.yml'];
  assert.deepEqual(affected(files, 'release'), { all: false, apps: [] });
  assert.equal(affected(files, 'harness').all, true);
  assert.deepEqual(apps(files, 'ci'), ['basegeek']);
});

test("an app's scenes run that app's shard only", () => {
  assert.deepEqual(affected(['tools/mobile-harness/apps/gamegeek/scenes.mjs'], 'harness'), { all: false, apps: ['gamegeek'] });
});

test("a workflow's own file means everything for that workflow", () => {
  assert.equal(affected(['.github/workflows/release.yml'], 'release').all, true);
  assert.equal(affected(['.github/workflows/ci.yml'], 'ci').all, true);
  assert.equal(affected(['.github/workflows/ci.yml'], 'release').all, false);
});

test('an app this table does not know means everything', () => {
  assert.equal(affected(['apps/newgeek/src/a.js'], 'release').all, true);
});

test('the table covers every app directory, every harness app, and real paths', () => {
  const dirs = fs.readdirSync(new URL('../apps', import.meta.url)).sort();
  assert.deepEqual([...APP_NAMES].sort(), dirs);
  assert.deepEqual([...HARNESS_APPS].sort(), dirs);
  for (const row of CI_APPS) {
    for (const key of ['be', 'fe', 'web']) {
      if (row[key]) assert.ok(fs.existsSync(new URL(`../${row[key]}/package.json`, import.meta.url)), `${row.app}.${key}`);
    }
  }
});
