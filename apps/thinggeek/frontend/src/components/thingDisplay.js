/** Small shared read-outs of a thing, so a card, a row and a report say it the same way. */
import { shortWhereLabel } from '../utils/where';
import { formatMoney, moneyAmount } from '../utils/money';

/** Where it is, short: "Garage › Van" (its parent and that one's parent). */
export function thingWhereText(thing) {
  return shortWhereLabel(thing);
}

/** "Boat · Garage › Van" — or whichever half exists. */
export function thingMetaLine(thing) {
  return [thing?.type?.name, thingWhereText(thing)].filter(Boolean).join(' · ');
}

export function thingValueText(thing) {
  const amount = moneyAmount(thing?.value);
  return amount === null ? '' : formatMoney(amount, thing.value?.currency || 'USD');
}

export const coverSrc = (thing) => thing?.coverPhoto?.thumbUrl || thing?.coverPhoto?.url || null;
