/**
 * Every filter section, in the order the app's `sections` config gives. The
 * desktop panel and the phone sheet render this same component; only the
 * frame around it differs.
 *
 * A section:
 *   { id, title, kind, key?, facet?, ...kind options, quiet?, caption?(ctx),
 *     switches?: [{ key, label, countFacet, on = true }] }
 *
 * Kinds:
 *   list     checkboxes for `filter[key]` from `facets[facet]`. `fixed` (an
 *            array, or `(context) => array`) sets the order, `closedList`
 *            lists exactly it, `limit` shows that many before "Show all",
 *            `label(value, context)` / `hint(value, context)` word each
 *            value, `optionsLabel` names the group (default: title),
 *            `emptyText`.
 *   single   radios with "Any" (`anyLabel`) first, for a one-value key.
 *   grouped  a searchable, grouped long list (GroupedFacetOptions):
 *            `groupOf`, `groupOrder`, `groupLabel`, `itemNoun`, `emptyText`,
 *            `collapsedGroups` (headings folded behind a disclosure, last).
 *            `match: { key, over: [listKeys], text }` shows an Any/All toggle
 *            once more than one value across `over` is chosen.
 *   range    RangeFacet over `facets[facet]` buckets, writing `minKey` /
 *            `maxKey`; `bucketKey`, `step`, `labels`.
 *   switch   only its `switches`; each writes `on` or null.
 *   custom   `render(ctx)` and `activeCount(filter)`, for anything else.
 * Any kind may also carry `switches`, rendered above its options (a cleanup
 * section's "Not installed anymore" above its metadata statuses).
 *
 * `context` is whatever the app's label/fixed functions need (custom
 * shelves, say). Section open/closed state comes in from `useSectionOpen()`
 * (filterUi.js): remembered per viewer, shared by both frames.
 */
import React, { useId } from 'react';
import { Box, Switch, ToggleButton, ToggleButtonGroup, alpha } from '@mui/material';
import { countNoun, useCollectionConfig } from '../config';
import { sectionActiveCount, sectionOptions } from '../facets/options';
import FacetOptions from './FacetOptions';
import FacetSection from './FacetSection';
import GroupedFacetOptions from './GroupedFacetOptions';
import RangeFacet from './RangeFacet';

export function MatchToggle({ value, onChange, text }) {
  const labelId = useId();
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, pb: 1, fontSize: '0.8125rem', color: 'text.secondary' }}>
      <span id={labelId}>Match</span>
      <ToggleButtonGroup
        exclusive
        size="small"
        value={value}
        aria-labelledby={labelId}
        onChange={(_e, v) => v && onChange(v)}
        sx={{
          '& .MuiToggleButton-root': {
            minHeight: { xs: 44, md: 30 },
            minWidth: 52,
            px: 1.25,
            textTransform: 'none',
            fontSize: '0.8125rem',
            fontWeight: 500,
            color: 'text.secondary',
            borderColor: 'border',
            '&.Mui-selected, &.Mui-selected:hover': {
              color: 'text.primary',
              fontWeight: 600,
              bgcolor: (t) => alpha(t.palette.primary.main, t.palette.mode === 'dark' ? 0.16 : 0.1),
            },
          },
        }}
      >
        <ToggleButton value="any">Any</ToggleButton>
        <ToggleButton value="all">All</ToggleButton>
      </ToggleButtonGroup>
      {text ? <span>{text}</span> : null}
    </Box>
  );
}

export function SwitchRow({ label, checked, count, onChange }) {
  const { noun } = useCollectionConfig();
  return (
    <Box
      component="label"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        minHeight: 44,
        pl: 1,
        borderRadius: '8px',
        cursor: 'pointer',
        '&:hover': { bgcolor: (t) => alpha(t.palette.text.primary, 0.045) },
      }}
    >
      <Box component="span" sx={{ flex: 1, fontSize: '0.875rem', fontWeight: checked ? 600 : 400, color: 'text.primary' }}>
        {label}
      </Box>
      <Box component="span" sx={{ fontSize: '0.75rem', color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
        {count ?? ''}
      </Box>
      <Switch
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        inputProps={{ 'aria-label': count == null ? label : `${label}, ${countNoun(count, noun)}` }}
      />
    </Box>
  );
}

const countOf = (facets, field) => facets.current?.[field] ?? facets.base?.[field] ?? null;

export default function FilterSections({ sections, lib, facets, context = {}, open, onToggleSection }) {
  const { state, toggle, update } = lib;
  const f = state.filter;
  const base = facets.base;
  const current = facets.current;
  const optionsFor = (section) => sectionOptions(section, { facets, filter: f, context });

  const switchRows = (section) =>
    (section.switches ?? []).map((s) => {
      const on = s.on ?? true;
      return (
        <SwitchRow
          key={s.key}
          label={s.label}
          checked={f[s.key] === on}
          count={s.countFacet ? countOf(facets, s.countFacet) : null}
          onChange={(checked) => update({ [s.key]: checked ? on : null })}
        />
      );
    });

  const body = (section) => {
    switch (section.kind) {
      case 'single': {
        const options = [
          { value: '', label: section.anyLabel ?? 'Any', count: current?.total ?? base?.total ?? null, selected: !f[section.key] },
          ...optionsFor(section),
        ];
        return (
          <>
            {switchRows(section)}
            <FacetOptions
              type="radio"
              name={`facet-${section.id}`}
              label={section.optionsLabel ?? section.title}
              options={options}
              onChange={(v) => update({ [section.key]: v })}
            />
          </>
        );
      }
      case 'grouped': {
        const m = section.match;
        const chosen = m ? m.over.reduce((n, k) => n + (f[k]?.length ?? 0), 0) : 0;
        return (
          <>
            {switchRows(section)}
            {m && chosen > 1 ? <MatchToggle value={f[m.key]} text={m.text} onChange={(v) => update({ [m.key]: v })} /> : null}
            <GroupedFacetOptions
              options={optionsFor(section)}
              limit={section.limit}
              onChange={(v) => toggle(section.key, v)}
              groupOf={section.groupOf}
              groupOrder={section.groupOrder}
              groupLabel={section.groupLabel}
              itemNoun={section.itemNoun}
              emptyText={section.emptyText}
              collapsedGroups={section.collapsedGroups}
            />
          </>
        );
      }
      case 'range':
        return (
          <>
            {switchRows(section)}
            <RangeFacet
              baseBuckets={base?.[section.facet] ?? []}
              liveBuckets={current?.[section.facet]}
              bucketKey={section.bucketKey}
              step={section.step}
              labels={section.labels}
              min={f[section.minKey]}
              max={f[section.maxKey]}
              onCommit={({ min, max }) => update({ [section.minKey]: min, [section.maxKey]: max })}
            />
          </>
        );
      case 'switch':
        return <>{switchRows(section)}</>;
      case 'custom':
        return section.render({ lib, facets, filter: f, context, optionsFor });
      default:
        return (
          <>
            {switchRows(section)}
            <FacetOptions
              label={section.optionsLabel ?? section.title}
              options={optionsFor(section)}
              limit={section.limit}
              onChange={(v) => toggle(section.key, v)}
              emptyText={section.emptyText ?? 'Nothing recorded yet.'}
            />
          </>
        );
    }
  };

  return (
    <Box>
      {sections.map((section) => (
        <FacetSection
          key={section.id}
          id={section.id}
          title={section.title}
          caption={section.caption ? section.caption({ facets, filter: f, context }) : undefined}
          quiet={section.quiet}
          open={Boolean(open[section.id])}
          onToggle={onToggleSection}
          activeCount={sectionActiveCount(section, f)}
        >
          {body(section)}
        </FacetSection>
      ))}
    </Box>
  );
}
