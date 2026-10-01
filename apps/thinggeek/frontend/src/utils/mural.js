/**
 * Truck-side murals and storage-unit numbers: deterministic decoration for a
 * place, from its name alone (components/TruckMural.jsx, StorageUnit.jsx).
 */
import { hashString } from '../theme/theme';

/**
 * The motif painted for a place: the first keyword that matches its name
 * (or its type's name), else the open road. Order matters: "boat garage"
 * is a garage.
 */
export const MURAL_MOTIFS = [
  ['garage', /garage|carport|driveway/],
  ['workshop', /shop|workshop|work bench|workbench|tool/],
  ['kitchen', /kitchen|pantry|galley/],
  ['bedroom', /bed ?room|bedroom|nursery|guest|master|kids?'? room/],
  ['office', /office|study|den|desk|library/],
  ['boat', /boat|dock|marina|slip|lake|wendy/],
  ['attic', /attic|storage|basement|cellar|loft|crawl/],
  ['closet', /closet|wardrobe|cupboard|linen/],
  ['bath', /bath|laundry|utility/],
  ['living', /living|lounge|family|great room|tv room/],
  ['yard', /yard|garden|shed|patio|porch|deck|barn/],
  ['vehicle', /van|truck|car|trailer|camper|rv\b|jeep/],
  ['safe', /safe|vault|locker/],
  ['house', /house|home|cabin|apartment|condo/],
];

export function muralMotif(name = '', typeName = '') {
  const s = `${name} ${typeName}`.toLowerCase();
  for (const [key, re] of MURAL_MOTIFS) if (re.test(s)) return key;
  return 'road';
}

/**
 * Sky palettes, picked per place by its name's hash (dawn, noon, dusk,
 * desert, pine, storm). Each has a night twin for dark mode. [top, horizon, hills, road]
 */
export const MURAL_SKIES = {
  light: [
    ['#F7B267', '#FBE3B6', '#B5793F', '#3A332C'],
    ['#7FB3D5', '#D8EAF3', '#7C9A5B', '#3A3530'],
    ['#E2725B', '#F6C48B', '#9C5A3C', '#2F2925'],
    ['#E9A65B', '#F5DDB0', '#C0874B', '#3B332B'],
    ['#8DB8A8', '#E0ECDF', '#4F7556', '#33302B'],
    ['#9AA7B5', '#DCE1E6', '#6C7480', '#2E2B28'],
  ],
  dark: [
    ['#1B1830', '#5A3A3A', '#2B2119', '#0D0B09'],
    ['#0F1B2C', '#2E4A63', '#1D2A1B', '#0C0B0A'],
    ['#241425', '#7A3D2B', '#2A1A14', '#0B0A09'],
    ['#1E1712', '#6B4425', '#2C2015', '#0C0A08'],
    ['#0E1A17', '#2D4A3F', '#15241A', '#0B0B0A'],
    ['#14171C', '#3A414B', '#1D2026', '#0B0B0B'],
  ],
};

export function muralSky(name = '', mode = 'light') {
  const list = MURAL_SKIES[mode] ?? MURAL_SKIES.light;
  return list[hashString(name) % list.length];
}

/** A storage-unit number for a place: a row letter and two digits, e.g. "C-14". Stable per name. */
export function unitNumber(name = '') {
  const h = hashString(name);
  const row = 'ABCDEFGH'[h % 8];
  const num = String(((h >>> 3) % 89) + 10);
  return `${row}-${num}`;
}
