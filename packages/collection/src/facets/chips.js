/**
 * The active-filter chips, described by the app as an ordered spec list and
 * built against the current state. Each chip carries the `patch` that removes
 * exactly it (hand it to `update()`), computed against the state it was
 * built from.
 *
 *   buildActiveChips(codec, state, [
 *     { kind: 'search', key: 'q' },                                  // “zelda”
 *     { kind: 'list', key: 'genres', group: 'Genre', label: (v, ctx) => … },
 *     { kind: 'single', key: 'played', group: 'Played', label: (v) => … },
 *     { kind: 'single', key: 'owned', scope: 'state', group: 'Owned', label: … },
 *     { kind: 'boolean', key: 'favorite', group: 'Favorites', labels: { true: 'Only', false: 'Excluded' } },
 *     { kind: 'flag', key: 'needsDecision', group: 'Cleanup', label: 'Not installed anymore' },
 *     { kind: 'range', id: 'year', minKey: 'releaseYearMin', maxKey: 'releaseYearMax', group: 'Released' },
 *     { kind: 'custom', build: (state, ctx) => [chip…] },
 *   ], context)
 *
 * The chip shape is `{ id, group, label, patch }`; ActiveChips renders it.
 * A search chip also carries `search: true`, and a custom chip may set
 * `modifier: true` (e.g. "Match: All of them") — neither names a saved view
 * (`suggestViewName`).
 */

/** "2010–2020", "2010" (one year), "2010 or later", "Up to 2020". */
export function rangeLabel(min, max) {
  if (min != null && max != null) return min === max ? String(min) : `${min}–${max}`;
  if (min != null) return `${min} or later`;
  return `Up to ${max}`;
}

export function buildActiveChips(codec, state, specs, context = {}) {
  const f = { ...codec.EMPTY_FILTER, ...state.filter };
  const chips = [];
  const labelOf = (spec, value) => (typeof spec.label === 'function' ? spec.label(value, context) : spec.label ?? value);

  for (const spec of specs) {
    switch (spec.kind) {
      case 'search': {
        const q = (f[spec.key] || '').trim();
        if (q) chips.push({ id: spec.id ?? spec.key, group: spec.group ?? 'Search', label: `“${q}”`, patch: { [spec.key]: '' }, search: true });
        break;
      }
      case 'list':
        (f[spec.key] || []).forEach((value) =>
          chips.push({
            id: `${spec.key}:${value}`,
            group: spec.group,
            label: labelOf(spec, value),
            patch: { [spec.key]: f[spec.key].filter((v) => v !== value) },
          })
        );
        break;
      case 'single': {
        if (spec.scope === 'state') {
          const def = codec.stateFields.find((s) => s.key === spec.key);
          const v = state[spec.key];
          if (def && def.values.includes(v)) {
            chips.push({ id: spec.id ?? spec.key, group: spec.group, label: labelOf(spec, v), patch: { [spec.key]: def.default } });
          }
        } else if (f[spec.key]) {
          chips.push({ id: spec.id ?? spec.key, group: spec.group, label: labelOf(spec, f[spec.key]), patch: { [spec.key]: codec.EMPTY_FILTER[spec.key] } });
        }
        break;
      }
      case 'boolean':
        if (f[spec.key] !== null && f[spec.key] !== undefined) {
          chips.push({ id: spec.id ?? spec.key, group: spec.group, label: spec.labels[String(f[spec.key])], patch: { [spec.key]: null } });
        }
        break;
      case 'flag':
        if (f[spec.key] === true) chips.push({ id: spec.id ?? spec.key, group: spec.group, label: labelOf(spec, true), patch: { [spec.key]: null } });
        break;
      case 'range': {
        const min = f[spec.minKey];
        const max = f[spec.maxKey];
        if (min != null || max != null) {
          chips.push({
            id: spec.id ?? spec.minKey,
            group: spec.group,
            label: (spec.format ?? rangeLabel)(min, max),
            patch: { [spec.minKey]: null, [spec.maxKey]: null },
          });
        }
        break;
      }
      case 'custom':
        chips.push(...(spec.build(state, context) ?? []));
        break;
      default:
        break;
    }
  }
  return chips;
}

/** A sensible default name for a saved view from its chips: "RPG · Steam", else `fallback`. */
export function suggestViewName(chips, fallback) {
  const words = chips.filter((c) => !c.search && !c.modifier).slice(0, 3).map((c) => c.label);
  return words.length ? words.join(' · ') : fallback;
}
