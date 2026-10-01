/**
 * Moving Day's box markings: what's stencilled on a thing's box. Pure and
 * deterministic, so the same thing always gets the same marks.
 *
 * SIZE (the stencil on the box's orange band):
 *   OVERSIZE  vehicles, boats and trailers — they ride on the truck, not in a box
 *             (type key/icon/name matches boat, vehicle, car, truck, trailer, kayak, bike…)
 *   for a CONTAINER, by how much is inside it (childCount / contentsCount):
 *             0–3 SMALL · 4–11 MEDIUM · 12+ LARGE
 *   for an ITEM, by its type: appliances and furniture LARGE; tools,
 *             electronics, keyboards and firearms MEDIUM; everything else SMALL
 *   a LOCATION is a room, not a box: no size.
 *
 * CARE (an extra stamp, kept tasteful and literal):
 *   FRAGILE           electronics, cameras, keyboards, computers, glass, art
 *   HANDLE WITH CARE  firearms — and nothing more is implied about them
 *   none              everything else
 */
import { kindOf } from './where';

export const BOX_SIZES = ['SMALL', 'MEDIUM', 'LARGE', 'OVERSIZE'];

const OVERSIZE_RE = /\b(boat|vehicle|car|truck|trailer|kayak|canoe|bike|motorcycle|atv|rv|camper|tractor|mower)\b|directionsboat|directionscar|localshipping|kayaking|pedalbike|twowheeler|agriculture/;
const LARGE_RE = /\b(appliance|furniture|fridge|washer|dryer|sofa|couch|bed|table|piano)\b|kitchen|chair|bed|locallaundryservice/;
const MEDIUM_RE = /\b(tool|electronics|keyboard|firearm|computer|tv|television|console|safe)\b|handyman|construction|carpenter|hardware|devices|computer|gpsfixed|keyboard/;
const FRAGILE_RE = /\b(electronics|camera|keyboard|computer|laptop|tv|television|glass|art|monitor|lens|console|audio)\b|devices|photocamera|computer|headphones|keyboard/;
const CARE_RE = /\bfirearms?\b|gpsfixed/;

/** One lowercased string to match a type against: its key, icon and name. */
function typeWords(thing) {
  const t = thing?.type ?? {};
  return [t.key, t.icon, t.name].filter(Boolean).join(' ').toLowerCase();
}

const contentsOf = (thing) => Number(thing?.childCount ?? thing?.contentsCount ?? thing?.contents?.length ?? 0) || 0;

/** The size stencil for a thing, or null (a location is a room, not a box). */
export function boxSizeFor(thing) {
  const kind = kindOf(thing);
  if (kind === 'location') return null;
  const words = typeWords(thing);
  if (OVERSIZE_RE.test(words)) return 'OVERSIZE';
  if (kind === 'container') {
    const n = contentsOf(thing);
    if (n >= 12) return 'LARGE';
    if (n >= 4) return 'MEDIUM';
    return 'SMALL';
  }
  if (LARGE_RE.test(words)) return 'LARGE';
  if (MEDIUM_RE.test(words)) return 'MEDIUM';
  return 'SMALL';
}

/** The care stamp, or null. Firearms get "HANDLE WITH CARE" and nothing else. */
export function careMarkFor(thing) {
  if (kindOf(thing) === 'location') return null;
  const words = typeWords(thing);
  if (CARE_RE.test(words)) return 'HANDLE WITH CARE';
  if (FRAGILE_RE.test(words)) return 'FRAGILE';
  return null;
}

export function boxMarks(thing) {
  return { size: boxSizeFor(thing), care: careMarkFor(thing) };
}

export const isOversize = (thing) => boxSizeFor(thing) === 'OVERSIZE';
