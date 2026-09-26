/**
 * The phone's filters: a full-height sheet with the same sections as the
 * desktop panel and a sticky footer, in the thumb zone, that says what you
 * will get — "Clear all · Show 124 games". Every tap writes the URL straight
 * away, so the list behind the sheet is already filtered and "Show" is just
 * close.
 *
 * Escape and the backdrop close it (GeekSheet), and MUI's modal hands focus
 * back to the Filters button that opened it.
 */
import React from 'react';
import { Box, Button } from '@mui/material';
import { GeekSheet } from '@geeksuite/ui';
import FilterSections from './FilterSections';
import { useCollectionConfig } from '../config';
import { showLabel } from './filterUi';

export default function FiltersSheet({ open, onClose, sections, lib, facets, context, sectionsOpen, onToggleSection, total, title = 'Filters' }) {
  const { noun } = useCollectionConfig();
  return (
    <GeekSheet
      open={open}
      onClose={onClose}
      snap="full"
      mode="sheet"
      title={title}
      actions={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
          {lib.activeCount ? (
            <Button onClick={lib.clearAll} sx={{ minHeight: 48, px: 2, color: 'text.secondary', fontWeight: 600, flexShrink: 0 }}>
              Clear all
            </Button>
          ) : null}
          <Button
            variant="contained"
            onClick={onClose}
            data-testid="filters-sheet-show"
            sx={{ flex: 1, minHeight: 48, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}
          >
            {showLabel(total, noun)}
          </Button>
        </Box>
      }
      bodySx={{ px: 1 }}
    >
      <FilterSections sections={sections} lib={lib} facets={facets} context={context} open={sectionsOpen} onToggleSection={onToggleSection} />
    </GeekSheet>
  );
}
