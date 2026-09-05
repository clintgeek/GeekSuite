// Realistic FlockGeek fixtures — trimmed from the M3 screenshot harness
// (scratchpad harness/shoot-flockgeek.mjs) so component tests exercise the
// same shapes the real GraphQL API returns.

const day = (offset) => {
  const d = new Date('2026-09-05T00:00:00.000Z');
  d.setDate(d.getDate() + offset);
  return d.toISOString();
};

export const LOCATIONS = [
  { id: 'l1', name: 'North Coop', type: 'coop', capacity: 24, isActive: true },
  { id: 'l2', name: 'Tractor A', type: 'tractor', capacity: 8, isActive: true },
  { id: 'l3', name: 'Breeding Pen 1', type: 'breeding_pen', capacity: 6, isActive: true },
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
  id: `b${i + 1}`,
  tagId,
  name,
  sex,
  breed,
  hatchDate: day(age),
  status,
  locationId,
}));

export const HARVESTS = Array.from({ length: 12 }, (_, i) => ({
  id: `e${i + 1}`,
  date: day(-i),
  eggsCount: [9, 11, 8, 12, 7, 10, 9, 13, 6, 11, 10, 8][i],
  daysObserved: i === 4 || i === 8 ? 2 : 1,
  locationId: i % 3 === 2 ? 'l2' : 'l1',
  notes: i === 3 ? 'One cracked in the nest box.' : '',
}));

export const HATCHES = Array.from({ length: 12 }, (_, i) => {
  const eggsSet = [24, 18, 30, 12, 24, 21, 15, 24, 18, 30, 12, 24][i];
  const fertile = eggsSet - (i % 4) - 1;
  const hatched = fertile - (i % 5);
  const pullets = Math.floor(hatched / 2);
  return {
    id: `h${i + 1}`,
    pairingId: `p${(i % 4) + 1}`,
    setDate: day(-21 - i * 24),
    hatchDate: i === 0 ? null : day(-i * 24),
    eggsSet,
    eggsFertile: fertile,
    chicksHatched: hatched,
    pullets,
    cockerels: hatched - pullets,
  };
});

export const SUMMARY_STATS = {
  birdsCount: 12,
  layingHensCount: 7,
  groupsCount: 4,
  avgDailyEggs: 9.6,
  recentHatches: HATCHES.slice(0, 3),
};
