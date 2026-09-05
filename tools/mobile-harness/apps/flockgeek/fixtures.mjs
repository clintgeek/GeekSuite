// FlockGeek fixtures (MOBILE_UI_PLAN.md M3).
//
// Every data call goes through /graphql (Apollo, named operations) plus
// /api/me for the session, so fixtures are keyed by GraphQL operation name.
// Everything else under /api/ gets a generic 200 so the basegeek bootstrap
// never blocks a render.
import { sessionRoutes, graphqlRoute } from '../../lib/net.mjs';

const now = new Date();
const iso = (dayOffset, hour = 9) => {
  const d = new Date(now);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};
const day = (dayOffset) => {
  const d = new Date(now);
  d.setDate(d.getDate() + dayOffset);
  return `${d.toISOString().slice(0, 10)}T00:00:00.000Z`;
};

export const LOCATIONS = [
  { __typename: 'FlockLocation', id: 'l1', name: 'North Coop', type: 'coop', capacity: 24, isActive: true, description: 'The old barn coop, rebuilt spring 2023.', notes: 'Roof needs a look before winter.' },
  { __typename: 'FlockLocation', id: 'l2', name: 'Tractor A', type: 'tractor', capacity: 8, isActive: true, description: 'Moved every third morning.', notes: null },
  { __typename: 'FlockLocation', id: 'l3', name: 'Breeding Pen 1', type: 'breeding_pen', capacity: 6, isActive: true, description: null, notes: 'Orpington trio this season.' },
];

const BIRD_ROWS = [
  ['NC-001', 'Henrietta', 'hen', 'Buff Orpington', -900, 'active', 'l1'],
  ['NC-002', 'Agatha', 'hen', 'Buff Orpington', -900, 'active', 'l1'],
  ['NC-003', 'Marple', 'hen', 'Barred Rock', -640, 'active', 'l1'],
  ['NC-004', 'Poirot', 'rooster', 'Barred Rock', -640, 'active', 'l3'],
  ['NC-005', 'Wren', 'pullet', 'Easter Egger', -160, 'active', 'l2'],
  ['NC-006', 'Sparrow', 'pullet', 'Easter Egger', -160, 'active', 'l2'],
  ['NC-007', 'Bramble', 'cockerel', 'Welsummer', -150, 'meat run', 'l2'],
  ['NC-008', 'Thistle', 'hen', 'Welsummer', -1200, 'retired', 'l1'],
  ['NC-009', 'Juniper', 'hen', 'Australorp', -430, 'active', 'l1'],
  ['NC-010', 'Rosemary', 'hen', 'Australorp', -430, 'active', 'l1'],
  ['NC-011', 'Sage', 'pullet', 'Speckled Sussex', -120, 'active', 'l3'],
  ['NC-012', 'Bay', 'rooster', 'Speckled Sussex', -820, 'active', 'l3'],
];

export const BIRDS = BIRD_ROWS.map(([tagId, name, sex, breed, age, status, locationId], i) => ({
  __typename: 'Bird',
  id: `b${i + 1}`,
  tagId,
  name,
  sex,
  breed,
  hatchDate: day(age),
  status,
  species: 'chicken',
  strain: i % 3 === 0 ? 'Homestead line' : '',
  cross: i % 5 === 0,
  origin: i % 4 === 0 ? 'own_egg' : 'purchased',
  foundationStock: i < 2,
  locationId,
  temperamentScore: (i % 5) + 1,
  statusDate: status === 'active' ? null : day(age + 300),
  statusReason: status === 'retired' ? 'Stopped laying, kept as a pet.' : status === 'meat run' ? 'Surplus cockerel.' : null,
  notes: i % 4 === 0 ? 'Broody most of June. Good mother.' : '',
  createdAt: iso(-30 + i, 8),
}));

export const EGGS = Array.from({ length: 12 }, (_, i) => ({
  __typename: 'EggProduction',
  id: `e${i + 1}`,
  date: day(-i),
  eggsCount: [9, 11, 8, 12, 7, 10, 9, 13, 6, 11, 10, 8][i],
  daysObserved: i === 4 || i === 8 ? 2 : 1,
  locationId: i % 3 === 2 ? 'l2' : 'l1',
  avgEggWeightGrams: 57 + (i % 4),
  eggColor: i % 3 === 0 ? 'brown' : 'cream',
  eggSize: 'large',
  source: 'manual',
  quality: 'good',
  notes: i === 3 ? 'One cracked in the nest box.' : i === 7 ? 'Found two under the tractor.' : '',
}));

export const PAIRINGS = Array.from({ length: 12 }, (_, i) => ({
  __typename: 'Pairing',
  id: `p${i + 1}`,
  name: ['Orpington trio', 'Barred Rock pen', 'Welsummer line', 'Sussex project', 'Australorp pair', 'Easter Egger mix',
    'Winter breeders', 'Spring hatch A', 'Spring hatch B', 'Show pen', 'Layer improvement', 'Test cross'][i],
  roosterIds: ['b4'].slice(0, (i % 2) + 1),
  henIds: ['b1', 'b2', 'b3'].slice(0, (i % 3) + 1),
  startDate: day(-40 - i * 12),
  endDate: null,
  active: i % 3 !== 0,
  notes: i === 0 ? 'Watch the hatch rate this round.' : '',
  season: ['spring', 'summer', 'autumn', 'winter'][i % 4],
  seasonYear: 2025 + (i % 2),
}));

export const HATCHES = Array.from({ length: 12 }, (_, i) => {
  const eggsSet = [24, 18, 30, 12, 24, 21, 15, 24, 18, 30, 12, 24][i];
  const fertile = eggsSet - (i % 4) - 1;
  const hatched = fertile - (i % 5);
  const pullets = Math.floor(hatched / 2);
  return {
    __typename: 'HatchEvent',
    id: `h${i + 1}`,
    pairingId: `p${(i % 4) + 1}`,
    setDate: day(-21 - i * 24),
    hatchDate: i === 0 ? null : day(-i * 24),
    eggsSet,
    eggsFertile: fertile,
    chicksHatched: hatched,
    pullets,
    cockerels: hatched - pullets,
    notes: i === 1 ? 'Two late hatchers, both fine.' : '',
  };
});

export const GROUPS = [
  { __typename: 'FlockGroup', id: 'g1', name: 'Main layer flock', purpose: 'layer_flock', type: 'standing', startDate: day(-800), endDate: null, description: 'The birds that feed the egg basket.', notes: 'Rotate out at three years.' },
  { __typename: 'FlockGroup', id: 'g2', name: 'Orpington breeders', purpose: 'breeder_flock', type: 'seasonal', startDate: day(-120), endDate: day(60), description: 'Buff line, second generation.', notes: '' },
  { __typename: 'FlockGroup', id: 'g3', name: 'Autumn meat run', purpose: 'meat_flock', type: 'batch', startDate: day(-90), endDate: day(-10), description: null, notes: 'Processed 12 October.' },
  { __typename: 'FlockGroup', id: 'g4', name: 'Brooder — spring hatch', purpose: 'brooder', type: 'batch', startDate: day(-30), endDate: null, description: 'Under the heat plate in the shed.', notes: '' },
];

export const MEMBERSHIPS = BIRDS.slice(0, 8).map((bird, i) => ({
  __typename: 'GroupMembership',
  id: `m${i + 1}`,
  groupId: ['g1', 'g1', 'g1', 'g2', 'g4', 'g4', 'g3', 'g1'][i],
  birdId: bird.id,
  joinedAt: iso(-200 + i, 8),
  leftAt: null,
  role: i === 3 ? 'sire' : 'member',
  bird: {
    __typename: 'Bird',
    id: bird.id, name: bird.name, tagId: bird.tagId,
    species: bird.species, breed: bird.breed, sex: bird.sex,
  },
}));

export const OPS = {
  GetBirds: { birds: BIRDS },
  GetFlockLocations: { flockLocations: LOCATIONS },
  GetEggProductions: { eggProductions: EGGS },
  GetPairings: { pairings: PAIRINGS },
  GetHatchEvents: { hatchEvents: HATCHES },
  GetFlockGroups: { flockGroups: GROUPS },
  GetGroupMemberships: { groupMemberships: MEMBERSHIPS },
};

// The scratch script's session user — no `role`, unlike net.mjs's
// DEFAULT_USER. Kept as-is; flockgeek doesn't gate on it.
export const USER = { id: 'u1', username: 'chef', email: 'chef@example.com', displayName: 'Chef Crocker', firstName: 'Clint', lastName: 'Crocker' };

export async function routes(ctx, { base, scheme, viewport } = {}) {
  await sessionRoutes(ctx, USER);
  await graphqlRoute(ctx, OPS);
}
