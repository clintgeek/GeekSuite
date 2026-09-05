// StoryGeek fixtures (MOBILE_UI_PLAN.md M4).
//
// storygeek's frontend talks to its own REST backend through an axios client
// with `baseURL: '/api'` (src/api.js) — no GraphQL on these routes — so the
// fixtures below are keyed by path. The Apollo client is still constructed
// at boot, hence a /graphql stub too.
import { json, sessionRoutes } from '../../lib/net.mjs';

const iso = (daysAgo) => new Date(Date.now() - daysAgo * 86400000).toISOString();

export const STORIES = [
  {
    _id: 's1', title: 'The Salt Road', genre: 'Fantasy', status: 'active',
    updatedAt: iso(1),
    stats: { totalInteractions: 41, totalDiceRolls: 12 },
    worldState: { currentSituation: 'The caravan master will not meet your eye, and the gate guard has begun to count.' },
  },
  {
    _id: 's2', title: 'Nine Hours to Ceres', genre: 'Sci-Fi', status: 'paused',
    updatedAt: iso(6),
    stats: { totalInteractions: 17, totalDiceRolls: 4 },
    worldState: { currentSituation: 'Reactor two is venting and nobody has answered the hail in four hours.' },
  },
  {
    _id: 's3', title: 'The House on Ashfield Lane', genre: 'Horror', status: 'completed',
    updatedAt: iso(21),
    stats: { totalInteractions: 88, totalDiceRolls: 31 },
    worldState: { currentSituation: 'Story setup in progress' },
  },
  {
    _id: 's4', title: 'Brass & Bramble', genre: 'Steampunk', status: 'setup',
    updatedAt: iso(30),
    stats: { totalInteractions: 2, totalDiceRolls: 0 },
    worldState: {},
  },
];

const FACTS = [
  { id: 'f1', fact: 'Mira Vane runs the salt weighing-house and takes a cut of every load.', category: 'character', turn: 3, source: 'narrator', visibility: 'public', subjects: ['Mira Vane'] },
  { id: 'f2', fact: 'The east gate is closed after the third bell.', category: 'location', turn: 5, source: 'setup', visibility: 'public', subjects: [] },
  { id: 'f3', fact: 'You told the guard your name was Aldric of Fenn — it is not.', category: 'event', turn: 7, source: 'player', visibility: 'secret', subjects: ['Corvin Hale'] },
  { id: 'f4', fact: 'The salt in the third cart is cut with something that burns green.', category: 'other', turn: 9, source: 'narrator', visibility: 'public', subjects: [] },
  { id: 'f5', fact: 'Mira owes the Ferrier house eleven marks and has not paid.', category: 'character', turn: 11, source: 'narrator', visibility: 'secret', subjects: ['Mira Vane'] },
];

export const STORY = {
  _id: 's1',
  title: 'The Salt Road',
  genre: 'Fantasy',
  status: 'active',
  updatedAt: iso(1),
  stats: { totalInteractions: 41, totalDiceRolls: 12 },
  worldState: {
    currentLocationName: 'The Weighing-House',
    currentSituation: 'The scales have been tampered with, and Mira knows that you know.',
    mood: 'tense', weather: 'rain', timeOfDay: 'dusk',
    turnNumber: 12, hoursElapsed: 53,
  },
  locations: [
    { name: 'The Weighing-House', type: 'building', state: 'intact', atmosphere: 'lamplit and close', description: 'Brass scales, damp sacking, the smell of the flats.' },
  ],
  characters: [
    {
      name: 'Corvin Hale', isPlayer: true, status: 'alive', isActive: true,
      currentState: 'Soaked to the shoulder, and short on time.',
      locationName: 'The Weighing-House',
      inventory: [
        { name: 'Ferrier writ', quantity: 1, isEquipped: false },
        { name: 'Long knife', quantity: 1, isEquipped: true },
        { name: 'Salt chit', quantity: 3, isEquipped: false },
        { name: 'Oilskin', quantity: 1, isEquipped: false },
      ],
      skills: [
        { name: 'Reckoning', level: 4 },
        { name: 'Persuasion', level: 3 },
        { name: 'Blade', level: 2 },
      ],
      knowledge: [{ factId: 'f3' }, { factId: 'f5' }],
    },
    {
      name: 'Mira Vane', isPlayer: false, status: 'alive', isActive: true,
      locationName: 'The Weighing-House', lastSeenTurn: 12,
      motivation: 'Clear the Ferrier debt before the month turns.',
      relationships: [{ characterName: 'Corvin Hale', relationshipType: 'rival' }],
      knowledge: [{ factId: 'f1' }, { factId: 'f2' }, { factId: 'f4' }],
    },
    {
      name: 'Teodor', isPlayer: false, status: 'alive', isActive: true,
      locationName: 'The Weighing-House', lastSeenTurn: 11,
      motivation: 'Get the carts moving and be paid.',
      relationships: [{ characterName: 'Corvin Hale', relationshipType: 'ally' }],
      knowledge: [{ factId: 'f2' }],
    },
  ],
  storyThreads: [
    { name: 'The tampered scales', type: 'quest', status: 'active', description: 'Prove the weighing-house is short-changing the flats before the caravan leaves.', openedTurn: 5, updatedTurn: 12, characterNames: ['Mira Vane'] },
    { name: 'The Ferrier debt', type: 'debt', status: 'active', description: 'Eleven marks, and the house does not forget.', openedTurn: 6, updatedTurn: 11, characterNames: ['Mira Vane'] },
    { name: 'The green salt', type: 'secret', status: 'active', description: 'Something in the third cart burns the wrong colour.', openedTurn: 9, updatedTurn: 9, characterNames: [] },
    { name: 'A name that was not yours', type: 'consequence', status: 'active', description: 'You gave the gate guard a name from a dead man’s writ.', openedTurn: 7, updatedTurn: 7, characterNames: [] },
    { name: 'The drowned courier', type: 'hunt', status: 'resolved', description: 'Find who pulled the courier from the flats.', openedTurn: 1, updatedTurn: 4, resolution: 'It was the tide, and nobody else.', characterNames: [] },
  ],
  storyState: { establishedFacts: FACTS },
  events: [
    { type: 'narration', description: 'Rain comes off the salt flats in sheets. The weighing-house door is unbarred, and inside a single lamp swings on its hook, throwing the brass scales into a slow, uneasy motion.', timestamp: iso(0.2), diceResults: [] },
    { type: 'dialogue', description: 'Player: I put my hand flat on the scale pan and ask her what it weighs.', timestamp: iso(0.19), diceResults: [] },
    { type: 'narration', description: 'Mira Vane does not look at your hand. "Nine stone, or near enough," she says, and the lamp swings, and the needle says otherwise. She has been doing this a long time, and she is very good at it, and she is not good enough tonight.', timestamp: iso(0.18), diceResults: [{ result: 17, interpretation: 'You catch the discrepancy' }] },
    { type: 'dialogue', description: 'Player: /recall what do we know about Mira', timestamp: iso(0.17), diceResults: [] },
  ],
};

export const BOOKIFY = {
  title: 'The Salt Road',
  content: [
    'CHAPTER ONE — The Weighing-House',
    '',
    'Rain came off the salt flats in sheets that night, and the road into the town was a road only by agreement. Corvin Hale walked it anyway, because the writ in his coat was worth eleven marks to somebody and nothing at all to him, and because the alternative was standing still.',
    '',
    'The weighing-house door was unbarred. Inside, a single lamp swung on its hook and threw the brass scales into a slow, uneasy motion, so that the needle never quite settled and the woman behind it never quite had to say a number twice.',
    '',
    '"Nine stone," said Mira Vane, "or near enough."',
    '',
    'It was not nine stone. It was not near enough. Corvin put his hand flat on the pan and watched the needle disagree with her, and watched her watch him watch it, and understood that the two of them had just arrived somewhere neither had planned to go.',
    '',
    'CHAPTER TWO — What the Salt Was Cut With',
    '',
    'Teodor had the carts moving by the third bell, which was later than he wanted and earlier than the gate allowed. He was a man who had made his peace with the difference between those two facts, and he did not thank anyone for pointing it out.',
    '',
    'The third cart burned green when it burned. Nobody in the yard said so out loud. That, more than the scales or the debt or the name Corvin had given the gate guard from a dead man\'s papers, was the thing that would matter by the month\'s end.',
  ].join('\n'),
};

export async function routes(ctx, { base, scheme, viewport } = {}) {
  // sessionRoutes' echoed-origin CORS handling covers this app too: the auth
  // client fetches `/me` cross-origin in dev (VITE_API_URL points elsewhere)
  // with `credentials: 'include'`, and a browser refuses a wildcard
  // Allow-Origin on a credentialed request.
  await sessionRoutes(ctx);
  await ctx.route('**/api/stories/user/**', (r) => json(r, STORIES));
  await ctx.route('**/api/stories/s1', (r) => json(r, STORY));
  await ctx.route('**/api/export/stories/*/bookify', (r) => json(r, { success: true, data: BOOKIFY }));
  // This app's own features go through REST, but the Apollo client is still
  // constructed at boot — stub graphql so it doesn't 404.
  await ctx.route('**/graphql', (r) => json(r, { data: {} }));
}
