/**
 * Every filter section, in the spec's order (DOCS/TAGS_AND_FILTERS.md §B2).
 * The desktop panel and the phone sheet render this same component; only the
 * frame around it differs.
 *
 * Section open/closed state comes in from `useSectionOpen()` (filterUi.js):
 * remembered per viewer, shared by both frames.
 */
import React, { useId } from 'react';
import { Box, Switch, ToggleButton, ToggleButtonGroup, alpha } from '@mui/material';
import { NEEDS_DECISION_LABEL, SECTIONS, buildOptions } from '../../utils/facets';
import FacetOptions from './FacetOptions';
import FacetSection from './FacetSection';
import TagFacet from './TagFacet';
import YearRangeFacet from './YearRangeFacet';

function MatchToggle({ value, onChange }) {
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
      <span>of the chosen genres &amp; tags</span>
    </Box>
  );
}

function SwitchRow({ label, checked, count, onChange }) {
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
        inputProps={{ 'aria-label': count == null ? label : `${label}, ${count} ${count === 1 ? 'game' : 'games'}` }}
      />
    </Box>
  );
}

/** A closed Cleanup section still says when games are waiting on a decision. */
function cleanupCaption(n) {
  return n > 0 ? `${n} not installed anymore` : undefined;
}

export default function FilterSections({ lib, facets, customShelves = [], open, onToggleSection }) {
  const { state, toggle, update } = lib;
  const f = state.filter;
  const base = facets.base;
  const current = facets.current;

  const optionsFor = (section) =>
    buildOptions(section, {
      base: base?.[section.facet],
      current: current?.[section.facet],
      selected: section.kind === 'single' ? (f[section.key] ? [f[section.key]] : []) : f[section.key],
      customShelves,
    });

  const body = (section) => {
    switch (section.kind) {
      case 'single': {
        const options = [
          { value: '', label: 'Any', count: current?.total ?? base?.total ?? null, selected: !f[section.key] },
          ...optionsFor(section),
        ];
        return (
          <FacetOptions
            type="radio"
            name={`facet-${section.id}`}
            label={section.title}
            options={options}
            onChange={(v) => update({ [section.key]: v })}
          />
        );
      }
      case 'tags': {
        const selectedCount = f.genres.length + f.tags.length;
        return (
          <>
            {selectedCount > 1 ? <MatchToggle value={f.tagMatch} onChange={(v) => update({ tagMatch: v })} /> : null}
            <TagFacet options={optionsFor(section)} limit={section.limit} onChange={(v) => toggle('tags', v)} />
          </>
        );
      }
      case 'year':
        return (
          <YearRangeFacet
            baseYears={base?.releaseYears ?? []}
            liveYears={current?.releaseYears}
            min={f.releaseYearMin}
            max={f.releaseYearMax}
            onCommit={(patch) => update(patch)}
          />
        );
      case 'switch':
        return (
          <SwitchRow
            label="Only favorites"
            checked={f.favorite === true}
            count={current?.favorites ?? base?.favorites ?? null}
            onChange={(on) => update({ favorite: on ? true : null })}
          />
        );
      case 'cleanup':
        return (
          <>
            <SwitchRow
              label={NEEDS_DECISION_LABEL}
              checked={f.needsDecision === true}
              count={current?.needsDecision ?? base?.needsDecision ?? null}
              onChange={(on) => update({ needsDecision: on ? true : null })}
            />
            <FacetOptions
              label="Metadata"
              options={optionsFor(section)}
              onChange={(v) => toggle(section.key, v)}
              emptyText="Every game is matched."
            />
          </>
        );
      default:
        return (
          <FacetOptions
            label={section.title}
            options={optionsFor(section)}
            limit={section.limit}
            onChange={(v) => toggle(section.key, v)}
            emptyText={section.id === 'metadata' ? 'Every game is matched.' : 'Nothing recorded yet.'}
          />
        );
    }
  };

  const activeCountOf = (section) => {
    switch (section.kind) {
      case 'single':
        return f[section.key] ? 1 : 0;
      case 'year':
        return f.releaseYearMin != null || f.releaseYearMax != null ? 1 : 0;
      case 'switch':
        return f.favorite !== null ? 1 : 0;
      case 'cleanup':
        return f[section.key].length + (f.needsDecision === true ? 1 : 0);
      default:
        return f[section.key].length;
    }
  };

  return (
    <Box>
      {SECTIONS.map((section) => (
        <FacetSection
          key={section.id}
          id={section.id}
          title={section.title}
          caption={section.kind === 'cleanup' ? cleanupCaption(current?.needsDecision ?? base?.needsDecision) : undefined}
          quiet={section.quiet}
          open={Boolean(open[section.id])}
          onToggle={onToggleSection}
          activeCount={activeCountOf(section)}
        >
          {body(section)}
        </FacetSection>
      ))}
    </Box>
  );
}
