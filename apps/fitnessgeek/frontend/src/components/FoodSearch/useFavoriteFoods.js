import { useEffect, useState } from 'react';
import { foodService } from '../../services/foodService.js';

/**
 * The foods this person starred, for the add sheet's "Favorites" chips.
 *
 * The star lives in Edit entry, and until now the only place it showed up
 * again was a small star on a row inside the folded "Your foods" list: you
 * had to know to open it. A favorite is offered on the sheet itself now,
 * whether or not it was eaten lately (the Again chips need two logs in four
 * weeks; a favorite needs one tap on the star).
 *
 * A short module cache, like the Again chips', so opening the sheet three
 * times in a sitting asks once. A failed read is not "no favorites": nothing
 * is cached and nothing is shown, and the next open asks again. Starring or
 * un-starring drops the cache (`forgetFavorites`, called by EditLogDialog).
 */
const TTL_MS = 2 * 60 * 1000;
let cached = null; // { at, value }

/** Drop the cache: a star was added or removed. */
export function forgetFavorites() {
  cached = null;
}

const usable = (food) => Boolean(food && typeof food === 'object' && (food.id || food._id) && String(food.name || '').trim());

async function load() {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  const answer = await foodService.getFavorites();
  const list = Array.isArray(answer) ? answer : (Array.isArray(answer?.data) ? answer.data : []);
  const value = list.filter(usable);
  cached = { at: Date.now(), value };
  return value;
}

/** @returns {object[]} the starred foods; empty while loading or when the read failed. */
export function useFavoriteFoods({ enabled = true } = {}) {
  const [favorites, setFavorites] = useState(() => (cached && Date.now() - cached.at < TTL_MS ? cached.value : []));

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    Promise.resolve()
      .then(load)
      .then((value) => { if (!cancelled) setFavorites(value); })
      .catch(() => { if (!cancelled) setFavorites([]); });
    return () => { cancelled = true; };
  }, [enabled]);

  return favorites;
}

export default useFavoriteFoods;
