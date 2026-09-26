/** Small shared read-outs of a thing, so a card, a row and a report say it the same way. */
import { shortPlaceLabel } from '../utils/places';
import { formatMoney, moneyAmount } from '../utils/money';

export function thingPlaceText(thing) {
  return thing?.place ? shortPlaceLabel(thing.place) : '';
}

/** "Boat · Garage › Shelf 2" — or whichever half exists. */
export function thingMetaLine(thing) {
  return [thing?.type?.name, thingPlaceText(thing)].filter(Boolean).join(' · ');
}

export function thingValueText(thing) {
  const amount = moneyAmount(thing?.value);
  return amount === null ? '' : formatMoney(amount, thing.value?.currency || 'USD');
}

export const coverSrc = (thing) => thing?.coverPhoto?.thumbUrl || thing?.coverPhoto?.url || null;
