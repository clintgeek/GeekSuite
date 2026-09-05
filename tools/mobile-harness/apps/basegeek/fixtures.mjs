// basegeek fixtures (MOBILE_UI_PLAN.md §4 basegeek, M4). Stubs every call the
// screenshotted pages make so Mission Control renders without a backend.
//
// basegeek is the one app whose AuthContext bootstraps from /api/auth/profile
// rather than /api/users/me, and RequireAdmin reads `role` off that bare user
// object — sessionRoutes serves both shapes, which is why the admin-only
// pages (UserGeek, DataGeek, AIGeek) render at all.
import { json, sessionRoutes, graphqlRoute } from '../../lib/net.mjs';
import { AI_OPS, AI_CALL } from './aigeek.mjs';

export const APPS = [
  { name: 'fitnessgeek', displayName: 'fitnessGeek', description: 'Nutrition & fitness', icon: 'FitnessCenter', color: '#7dac8e', url: 'https://fitnessgeek.clintgeek.com', tag: 'health' },
  { name: 'bujogeek', displayName: 'bujoGeek', description: 'Bullet journal & tasks', icon: 'Book', color: '#d4956a', url: 'https://bujogeek.clintgeek.com', tag: 'productivity' },
  { name: 'notegeek', displayName: 'noteGeek', description: 'Notes & documents', icon: 'Note', color: '#a99df0', url: 'https://notegeek.clintgeek.com', tag: 'productivity' },
  { name: 'bookgeek', displayName: 'bookGeek', description: 'Library & reading', icon: 'MenuBook', color: '#5fa8d3', url: 'https://bookgeek.clintgeek.com', tag: 'reading' },
  { name: 'flockgeek', displayName: 'flockGeek', description: 'Flock management', icon: 'NatureOutlined', color: '#9a8f6a', url: 'https://flockgeek.clintgeek.com', tag: 'management' },
  { name: 'startgeek', displayName: 'startGeek', description: 'Start page & launcher', icon: 'RocketLaunch', color: '#e6b35a', url: 'https://start.clintgeek.com', tag: 'launcher' },
];

export const HEALTH_APP = { status: 'online', latency: 42, data: { version: '1.4.2' }, checkedAt: new Date().toISOString() };
export const HEALTH_INFRA = {
  services: {
    mongo: { online: true, latency: 8 },
    redis: { online: true, latency: 3 },
    influx: { online: true, latency: 11 },
  },
};

export const MONGO_STATUS = {
  serverInfo: { version: '7.0.5', uptime: 512345, host: 'mongo-primary.internal', connections: 24, memory: { resident: 512 * 1024 * 1024, virtual: 2048 * 1024 * 1024 } },
  databases: [
    {
      name: 'notegeek',
      stats: { collections: 6, objects: 18234, avgObjSize: 2048, dataSize: 512 * 1024 * 1024, storageSize: 640 * 1024 * 1024, indexSize: 96 * 1024 * 1024 },
      collections: [
        { name: 'notes', count: 8213, size: 210 * 1024 * 1024, indexes: 3 },
        { name: 'tags', count: 412, size: 2 * 1024 * 1024, indexes: 2 },
      ],
    },
  ],
};

export const REDIS_STATUS = {
  status: 'connected',
  redisVersion: '7.2.4',
  uptime: 512345,
  connectedClients: 12,
  usedMemory: '45.2M',
  totalKeys: 8342,
};

export const POSTGRES_STATUS = {
  status: 'connected',
  version: 'PostgreSQL 16.2 on x86_64-pc-linux-gnu',
  uptime: { days: 12, hours: 4, minutes: 33 },
  dbSize: '512 MB',
  connectionCount: 8,
};

export const INFLUX_STATUS = {
  status: 'connected',
  config: { org: 'geeksuite-org', bucket: 'geekdata' },
  measurements: { count: 24, samples: ['cpu', 'mem', 'net', 'disk'] },
  stats: { pointsLastHour: 182345, lastPointTime: new Date().toISOString() },
};

export const USERS = {
  users: [
    { id: 'u1', username: 'chef', email: 'chef@example.com' },
    { id: 'u2', username: 'sage', email: 'sage@example.com' },
    { id: 'u3', username: 'demo-user-with-a-long-name', email: 'demo-user-with-a-long-name@example.com' },
  ],
};

// `theme` must match the context's requested colorScheme — the shared
// ThemeProvider syncs its cookie-derived preference to whatever the
// `/users/bootstrap` fixture reports once it loads, so a mismatched fixture
// silently overwrites the `geek_theme` cookie both contexts set.
const bootstrapFor = (scheme) => ({
  identity: { username: 'chef', email: 'chef@example.com', createdAt: '2025-01-01T00:00:00.000Z', lastLogin: new Date().toISOString() },
  profile: { displayName: 'Chef Crocker', bio: 'Runs the fleet.', timezone: 'America/Chicago', locale: 'en-US', country: 'US' },
  preferences: { theme: scheme, accentColor: '#e8a849', defaultApp: 'notegeek', dateFormat: 'US', timeFormat: '12h', startOfWeek: 'sunday' },
  appPreferences: { notegeek: { editorMode: 'markdown', fontSize: '16' } },
});

export async function routes(ctx, { scheme = 'dark' } = {}) {
  await sessionRoutes(ctx);
  await ctx.route('**/api/auth/validate', (r) => json(r, { success: true, valid: true }));
  await ctx.route('**/api/apps', (r) => json(r, { apps: APPS }));
  await ctx.route('**/api/health/infra', (r) => json(r, HEALTH_INFRA));
  await ctx.route('**/api/health/app/**', (r) => json(r, HEALTH_APP));
  await ctx.route('**/api/mongo/status', (r) => json(r, MONGO_STATUS));
  await ctx.route('**/api/redis/status', (r) => json(r, REDIS_STATUS));
  await ctx.route('**/api/postgres/status', (r) => json(r, POSTGRES_STATUS));
  await ctx.route('**/api/influx/status', (r) => json(r, INFLUX_STATUS));
  await ctx.route('**/api/users', (r) => (r.request().method() === 'GET' ? json(r, USERS) : json(r, { success: true })));
  await ctx.route('**/api/databases', (r) => json(r, { databases: [] }));
  await ctx.route('**/api/users/bootstrap', (r) => json(r, bootstrapFor(scheme)));
  await ctx.route('**/api/ai/call', (r) => json(r, AI_CALL));
  await graphqlRoute(ctx, AI_OPS);
}
