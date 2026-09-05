import App from '../models/App.js';
import logger from '../lib/logger.js';

// The suite's default app registry. Extracted out of routes/apps.js so it can
// be seeded both from the admin-only `POST /api/apps/seed` endpoint AND
// automatically at boot (see server.js) — one list, two callers, no drift.
//
// startgeek is a static bundle behind `serve`: no /api/health, so its default
// row probes the root instead.
export const DEFAULT_APPS = [
  { name: 'basegeek', displayName: 'baseGeek', description: 'Auth & shared services', icon: 'Dashboard', color: '#e8a849', url: 'https://basegeek.clintgeek.com', tag: 'platform', sortOrder: 0 },
  { name: 'notegeek', displayName: 'noteGeek', description: 'Notes & documents', icon: 'Note', color: '#a99df0', url: 'https://notegeek.clintgeek.com', tag: 'productivity', sortOrder: 1 },
  { name: 'bujogeek', displayName: 'bujoGeek', description: 'Bullet journal & tasks', icon: 'Book', color: '#d4956a', url: 'https://bujogeek.clintgeek.com', tag: 'productivity', sortOrder: 2 },
  { name: 'fitnessgeek', displayName: 'fitnessGeek', description: 'Nutrition & fitness', icon: 'FitnessCenter', color: '#7dac8e', url: 'https://fitnessgeek.clintgeek.com', tag: 'health', sortOrder: 3 },
  { name: 'storygeek', displayName: 'storyGeek', description: 'Story plotting & writing', icon: 'AutoStories', color: '#c76b8e', url: 'https://storygeek.clintgeek.com', tag: 'creative', sortOrder: 4 },
  { name: 'flockgeek', displayName: 'flockGeek', description: 'Flock management', icon: 'NatureOutlined', color: '#7dac8e', url: 'https://flockgeek.clintgeek.com', tag: 'management', sortOrder: 5 },
  { name: 'babelgeek', displayName: 'babelGeek', description: 'Translation & language', icon: 'Translate', color: '#6db5c0', url: 'https://babelgeek.clintgeek.com', tag: 'learning', sortOrder: 6 },
  { name: 'geekpr', displayName: 'geekPR', description: 'Autonomous code reviewer', icon: 'RateReview', color: '#8ba3d4', url: 'https://geekpr.clintgeek.com', tag: 'tools', sortOrder: 7 },
  { name: 'bookgeek', displayName: 'bookGeek', description: 'Library & reading', icon: 'MenuBook', color: '#5fa8d3', url: 'https://bookgeek.clintgeek.com', tag: 'reading', sortOrder: 8 },
  // Static bundle behind `serve`: no /api/health, so probe the root.
  { name: 'startgeek', displayName: 'startGeek', description: 'Start page & launcher', icon: 'RocketLaunch', color: '#e6b35a', url: 'https://start.clintgeek.com', healthEndpoint: '/', tag: 'launcher', sortOrder: 9 },
];

/**
 * Create any default app that isn't already in the registry, keyed by
 * `name`. Never updates or deletes an existing row — an app someone has
 * already customized (a different url, a disabled flag, a renamed
 * displayName) is left exactly as it is.
 *
 * @returns {Promise<{ created: number, skipped: number }>}
 */
export async function seedMissingApps() {
  let created = 0;
  let skipped = 0;

  for (const appData of DEFAULT_APPS) {
    const exists = await App.findOne({ name: appData.name });
    if (exists) {
      skipped++;
    } else {
      await App.create(appData);
      created++;
    }
  }

  logger.info({ created, skipped }, '[AppRegistrySeed] seed complete');
  return { created, skipped };
}
