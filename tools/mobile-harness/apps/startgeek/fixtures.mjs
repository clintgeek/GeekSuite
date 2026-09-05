// StartGeek fixtures (MOBILE_UI_PLAN.md M5).
//
// Stubs the basegeek session and every GraphQL operation by name so the
// console renders without a server. WeatherContext calls open-meteo/ipapi
// directly (not through /graphql), so those get real-shaped fixtures too —
// otherwise the weather block and its modal just render "Weather unavailable".
import { sessionRoutes, json, svg, graphqlRoute } from '../../lib/net.mjs';

// A bright, busy wallpaper: the panels have to stay readable over the worst case.
export const WALLPAPER = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
<defs><linearGradient id="s" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#f6d365"/><stop offset="0.45" stop-color="#fda085"/>
<stop offset="0.8" stop-color="#a1c4fd"/><stop offset="1" stop-color="#c2e9fb"/></linearGradient></defs>
<rect width="1920" height="1080" fill="url(#s)"/>
<g fill="#fff" opacity="0.55"><circle cx="380" cy="260" r="180"/><circle cx="1500" cy="700" r="240"/>
<circle cx="900" cy="180" r="120"/><circle cx="1150" cy="950" r="160"/></g>
<g stroke="#ffffff" stroke-width="3" opacity="0.5">
<path d="M0 540 L1920 300"/><path d="M0 760 L1920 620"/><path d="M0 940 L1920 880"/></g></svg>`;

export const TODAY = {
  date: '2026-09-05',
  tasks: {
    due: [
      { id: 't1', content: 'Finish the startgeek mobile pass', signifier: '!', status: 'pending', priority: 1, dueDate: '2026-09-05T14:00:00Z', tags: ['work'] },
      { id: 't2', content: 'Standup', signifier: '@', status: 'pending', priority: 2, dueDate: '2026-09-05T15:00:00Z', tags: [] },
    ],
    overdue: [
      { id: 't3', content: 'Reply to Chef about the merger doc', signifier: null, status: 'pending', priority: 1, dueDate: '2026-09-03T09:00:00Z', tags: [] },
    ],
    events: [],
    upcoming: [
      { id: 't4', content: 'Renew domain', signifier: null, status: 'pending', priority: 3, dueDate: '2026-09-08T09:00:00Z', tags: ['admin'] },
    ],
    completedCount: 3,
    blockedCount: 0,
  },
  reading: [{ id: 'bk1', title: 'Lock In', authors: ['John Scalzi'], readingProgress: 42, pageCount: 336, coverPath: null }],
  fitness: { caloriesConsumed: 1450, calorieGoal: 2100, streak: 6, meals: [] },
};

export const WEEK = [
  { date: '2026-09-05', dayName: 'Fri', condition: 'Clear', highTemp: 78, lowTemp: 60, precipProbability: 0, sunrise: '2026-09-05T06:30:00', sunset: '2026-09-05T19:20:00' },
  { date: '2026-09-06', dayName: 'Sat', condition: 'Partly cloudy', highTemp: 76, lowTemp: 59, precipProbability: 10 },
  { date: '2026-09-07', dayName: 'Sun', condition: 'Sunny', highTemp: 80, lowTemp: 61, precipProbability: 0 },
  { date: '2026-09-08', dayName: 'Mon', condition: 'Showers', highTemp: 72, lowTemp: 58, precipProbability: 60 },
  { date: '2026-09-09', dayName: 'Tue', condition: 'Cloudy', highTemp: 74, lowTemp: 57, precipProbability: 20 },
  { date: '2026-09-10', dayName: 'Wed', condition: 'Clear', highTemp: 77, lowTemp: 59, precipProbability: 0 },
  { date: '2026-09-11', dayName: 'Thu', condition: 'Clear', highTemp: 79, lowTemp: 60, precipProbability: 0 },
];

// The suite session the console reads via /api/users/me and /api/me.
export const USER = { id: 'u1', username: 'chef', email: 'chef@example.com', displayName: 'Chef' };

// Console settings seeded into localStorage before first paint — backdrop,
// clock format, and which modules render (calendar off, everything else on).
const SETTINGS = {
  backdrop: 'photo', clock: '12', ask: true,
  modules: { weather: true, today: true, calendar: false, fitness: true, reading: true },
  calendars: [],
};

const OPS = {
  GlanceToday: { glanceToday: TODAY },
  GlanceSearch: { glanceSearch: [] },
  CalendarEvents: { calendarEvents: [] },
};

export async function routes(ctx, { base, scheme, viewport } = {}) {
  await sessionRoutes(ctx, USER);
  await graphqlRoute(ctx, OPS);

  await ctx.route(/picsum\.photos/, (r) => svg(r, WALLPAPER));

  // Real-shaped ipapi/open-meteo responses so the weather block and modal
  // actually render instead of "Weather unavailable".
  await ctx.route(/ipapi\.co\/json/, (r) => json(r, { city: 'Austin', region: 'Texas', latitude: 30.27, longitude: -97.74 }));
  await ctx.route(/api\.open-meteo\.com/, (r) => {
    const daily = {
      time: WEEK.map((d) => d.date),
      temperature_2m_max: WEEK.map((d) => d.highTemp),
      temperature_2m_min: WEEK.map((d) => d.lowTemp),
      precipitation_probability_max: WEEK.map((d) => d.precipProbability),
      precipitation_sum: WEEK.map(() => 0),
      wind_speed_10m_max: WEEK.map(() => 8),
      weather_code: WEEK.map(() => 1),
      sunrise: WEEK.map((d) => d.sunrise || `${d.date}T06:30:00`),
      sunset: WEEK.map((d) => d.sunset || `${d.date}T19:20:00`),
    };
    return json(r, {
      current: {
        temperature_2m: 78, relative_humidity_2m: 55, apparent_temperature: 80,
        precipitation: 0, wind_speed_10m: 6, wind_direction_10m: 180,
        surface_pressure: 1013, weather_code: 1, time: '2026-09-05T03:00',
      },
      hourly: { precipitation_probability: Array(24).fill(0) },
      daily,
      daily_units: {},
    });
  });

  await ctx.addInitScript((settings) => {
    localStorage.setItem('startgeek.settings', JSON.stringify(settings));
  }, SETTINGS);
}
