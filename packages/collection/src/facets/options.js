/**
 * How a facet's server counts become the options a person sees.
 *
 * Two facet answers feed every list:
 *   - `base`: the unfiltered collection. It fixes the ORDER (most common
 *     first) and the universe of values, so options do not reshuffle or
 *     vanish as the counts move under other filters — no layout shift, and an
 *     option that would give zero stays on screen, dimmed.
 *   - `current`: the live counts under the active filter (each facet
 *     excluding its own selections — the server's rule; see
 *     `@geeksuite/collection/server` `buildFacetStage`).
 * A selected value is always present, even if neither answer lists it.
 */

/**
 * Build one facet's options.
 *
 * @param {object} p
 * @param {{value: string, count: number}[]} [p.base]    the unfiltered answer
 * @param {{value: string, count: number}[]} [p.current] the live answer (null while loading)
 * @param {string[]} [p.selected]  the values currently chosen
 * @param {string[]} [p.fixed]     a set display order; values not in it sort
 *   last. Without it, values sort by base count (desc) then value.
 * @param {boolean} [p.closedList] with `fixed`: list exactly `fixed`, zeros
 *   included (a closed vocabulary). Otherwise a fixed value nobody has is
 *   hidden unless selected.
 * @param {(value: string) => string} [p.label]
 * @param {(value: string) => string|undefined} [p.hint]
 * @returns {{value, label, hint, count, selected}[]} `count` is null while
 *   the live answer is not in yet (the row keeps its last width).
 */
export function buildFacetOptions({ base, current, selected = [], fixed, closedList = false, label = (v) => v, hint = () => undefined }) {
  const baseMap = new Map((base || []).map((v) => [v.value, v.count]));
  const curMap = current ? new Map(current.map((v) => [v.value, v.count])) : null;

  let values;
  if (fixed) {
    if (closedList) {
      values = [...fixed];
    } else {
      // A fixed order still hides a value nobody in the collection has (an
      // empty shelf), unless it is chosen; unknown extras from the server go last.
      const known = [...fixed, ...[...baseMap.keys()].filter((v) => !fixed.includes(v))];
      values = known.filter((v) => (baseMap.get(v) ?? 0) > 0 || (curMap?.get(v) ?? 0) > 0 || selected.includes(v));
    }
  } else {
    values = [...baseMap.keys()].sort((a, b) => baseMap.get(b) - baseMap.get(a) || String(a).localeCompare(String(b)));
    for (const v of curMap?.keys() ?? []) if (!baseMap.has(v)) values.push(v);
  }
  for (const v of selected) if (!values.includes(v)) values.push(v);

  return values.map((value) => ({
    value,
    label: label(value),
    hint: hint(value),
    count: curMap ? curMap.get(value) ?? 0 : baseMap.has(value) ? baseMap.get(value) : null,
    selected: selected.includes(value),
  }));
}

/**
 * The options that show before "Show all": the first `limit`, plus any
 * selected ones further down (a selected option never hides).
 */
export function visibleOptions(options, limit, expanded) {
  if (expanded || !limit || options.length <= limit) return options;
  const head = options.slice(0, limit);
  const tail = options.slice(limit).filter((o) => o.selected);
  return [...head, ...tail];
}

/**
 * Options bucketed by group, in `order`; empty groups dropped. `groupOf(value)`
 * names a value's group — anything it returns that is not in `order` lands in
 * the last group.
 */
export function groupOptions(options, groupOf, order) {
  const buckets = new Map(order.map((g) => [g, []]));
  const fallback = order[order.length - 1];
  options.forEach((o) => {
    const g = groupOf(o.value);
    (buckets.get(g) ?? buckets.get(fallback)).push(o);
  });
  return order.map((group) => ({ group, options: buckets.get(group) })).filter((g) => g.options.length);
}

/** The option list a `list`/`single`/`grouped` section shows, from its config. */
export function sectionOptions(section, { facets, filter, context }) {
  const selected = section.kind === 'single' ? (filter[section.key] ? [filter[section.key]] : []) : filter[section.key] ?? [];
  const fixed = typeof section.fixed === 'function' ? section.fixed(context) : section.fixed;
  return buildFacetOptions({
    base: facets.base?.[section.facet],
    current: facets.current?.[section.facet],
    selected,
    fixed,
    closedList: section.closedList,
    label: section.label ? (v) => section.label(v, context) : undefined,
    hint: section.hint ? (v) => section.hint(v, context) : undefined,
  });
}

/** How many of a section's values are on — what its heading's count pill shows. */
export function sectionActiveCount(section, filter) {
  const switches = (section.switches ?? []).reduce((n, s) => n + (filter[s.key] === (s.on ?? true) ? 1 : 0), 0);
  switch (section.kind) {
    case 'single':
      return (filter[section.key] ? 1 : 0) + switches;
    case 'range':
      return (filter[section.minKey] != null || filter[section.maxKey] != null ? 1 : 0) + switches;
    case 'switch':
      // A switch section counts its key whenever it is set at all (true OR
      // false narrows); extra switches count when on.
      return (section.switches ?? [])
        .map((s) => (filter[s.key] !== null && filter[s.key] !== undefined ? 1 : 0))
        .reduce((a, b) => a + b, 0);
    case 'custom':
      return section.activeCount ? section.activeCount(filter) : 0;
    default:
      return (filter[section.key]?.length ?? 0) + switches;
  }
}
