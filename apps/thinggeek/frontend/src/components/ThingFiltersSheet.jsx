/**
 * The phone's Filters sheet, ThingGeek's own (2026-11-18), on the shared
 * pieces — GeekSheet, FilterSections and ActiveChips from
 * `@geeksuite/collection` — rather than the shared FiltersSheet, because it
 * adds two things that one cannot:
 *
 *   - What is on, first. The active filters sit at the top as removable
 *     chips, so "why am I seeing only four things" is answered without
 *     scrolling to the Tags group.
 *   - No dead options. With a filter on, an option that would show nothing
 *     (Camera · 0, Firearm · 0…) is left out. The set is taken when the
 *     sheet opens and only ever SHRINKS while it is open (an option that
 *     comes back to life, say after a chip is removed, reappears) — so
 *     nothing jumps out from under a finger as you tap. A closed vocabulary
 *     (Missing: "No receipt · 0" is good news) keeps its zeros.
 *
 * And it wears the yard: kraft under the sections, the livery band under the
 * header, like the top bar.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { GeekSheet } from '@geeksuite/ui';
import { ActiveChips, FilterSections, showLabel, useCollectionConfig } from '@geeksuite/collection';
import { LIVERY_SHEET_HEADER_SX, dustImage } from '../theme/theme';

const isOptionList = (v) => Array.isArray(v) && v.every((o) => o && typeof o === 'object' && 'value' in o && 'count' in o);

/** `{ facetKey: Set(values) }`: values the base has but the live answer counts as zero. */
export function emptyOptions(facets) {
  const out = {};
  if (!facets?.base || !facets?.current || facets.current === facets.base) return out;
  Object.entries(facets.base).forEach(([key, list]) => {
    if (!isOptionList(list)) return;
    const live = facets.current[key];
    if (!isOptionList(live)) return;
    const counts = new Map(live.map((o) => [o.value, o.count]));
    const dead = list.filter((o) => o.count > 0 && !(counts.get(o.value) > 0)).map((o) => o.value);
    if (dead.length) out[key] = new Set(dead);
  });
  return out;
}

/** The facets with `hidden` values taken out of both answers (a chosen value always stays). */
export function withoutOptions(facets, hidden, selected = () => false) {
  const keys = Object.keys(hidden);
  if (!keys.length || !facets?.base) return facets;
  const strip = (answer) => {
    if (!answer) return answer;
    const next = { ...answer };
    keys.forEach((key) => {
      if (isOptionList(answer[key])) next[key] = answer[key].filter((o) => !hidden[key].has(o.value) || selected(key, o.value));
    });
    return next;
  };
  return { ...facets, base: strip(facets.base), current: strip(facets.current) };
}

function hiddenCount(hidden) {
  return Object.values(hidden).reduce((n, set) => n + set.size, 0);
}

export default function ThingFiltersSheet({ open, onClose, sections, lib, facets, context, sectionsOpen, onToggleSection, total, chips = [] }) {
  const { noun } = useCollectionConfig();
  const active = lib.activeCount > 0;
  const [hidden, setHidden] = useState({});
  const ready = Boolean(facets?.current);
  // Seeded once per open, at the first live answer: with nothing on then, nothing is
  // hidden for the rest of this open — a filter tapped inside the sheet never makes
  // options vanish under the finger. Afterwards the set is only ever intersected.
  const seededRef = useRef(false);

  useEffect(() => {
    if (!open) {
      seededRef.current = false;
      setHidden({});
      return;
    }
    if (!ready) return;
    if (!seededRef.current) {
      seededRef.current = true;
      setHidden(active ? emptyOptions(facets) : {});
      return;
    }
    setHidden((prev) => {
      if (!Object.keys(prev).length) return prev;
      const now = active ? emptyOptions(facets) : {};
      const next = {};
      Object.entries(prev).forEach(([key, set]) => {
        const still = new Set([...set].filter((v) => now[key]?.has(v)));
        if (still.size) next[key] = still;
      });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active, ready, facets?.current]);

  const keyForFacet = useMemo(() => new Map(sections.filter((s) => s.facet).map((s) => [s.facet, s.key])), [sections]);
  const isSelected = (facetKey, value) => {
    const k = keyForFacet.get(facetKey);
    const v = k ? lib.state?.filter?.[k] : null;
    return Array.isArray(v) ? v.includes(value) : v === value;
  };
  const shown = useMemo(() => withoutOptions(facets, hidden, isSelected), [facets, hidden]); // eslint-disable-line react-hooks/exhaustive-deps
  const folded = hiddenCount(hidden);

  return (
    <GeekSheet
      open={open}
      onClose={onClose}
      snap="full"
      mode="sheet"
      title="Filters"
      headerSx={LIVERY_SHEET_HEADER_SX}
      sx={{ bgcolor: 'background.desk', backgroundImage: (t) => dustImage(t.palette.mode) }}
      actions={
        // Clear all lives with the chips at the top (ActiveChips carries it), not twice.
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
          <Button variant="contained" onClick={onClose} data-testid="filters-sheet-show" sx={{ flex: 1, minHeight: 48, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            {showLabel(total, noun)}
          </Button>
        </Box>
      }
      bodySx={{ px: 1 }}
    >
      {chips.length ? (
        <Box data-testid="filters-sheet-on" sx={{ px: 1, pt: 1, pb: 1.5, mb: 0.5, borderBottom: 1, borderColor: 'divider' }}>
          <Typography component="p" sx={{ fontSize: '0.8125rem', fontWeight: 700, color: 'text.secondary', mb: 0.25 }}>
            On now
          </Typography>
          <ActiveChips chips={chips} onRemove={(c) => lib.update(c.patch)} onClearAll={lib.clearAll} />
          {folded ? (
            <Typography data-testid="filters-sheet-folded" sx={{ fontSize: '0.8125rem', color: 'text.secondary', mt: 0.5 }}>
              {folded === 1 ? '1 option that would show nothing is left out.' : `${folded} options that would show nothing are left out.`}
            </Typography>
          ) : null}
        </Box>
      ) : null}
      <FilterSections sections={sections} lib={lib} facets={shown} context={context} open={sectionsOpen} onToggleSection={onToggleSection} />
    </GeekSheet>
  );
}
