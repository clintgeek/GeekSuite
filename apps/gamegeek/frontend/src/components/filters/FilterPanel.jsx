/**
 * The desktop filter column (md+): 280px between the app sidebar and the
 * grid, sticky inside the library's scroll container so it stays put while
 * the covers scroll, with its own scroll when the sections run long.
 *
 * It sits on the page ground with a hairline to its right rather than on a
 * paper card: the sidebar is already paper, and two paper columns side by
 * side read as one wide slab.
 */
import React from 'react';
import { Box, ButtonBase, IconButton, Tooltip, Typography } from '@mui/material';
import { KeyboardDoubleArrowLeft as HideIcon } from '@mui/icons-material';
import { geekLayout } from '@geeksuite/ui';
import { DISPLAY_FONT } from '../../theme/theme';
import FilterSections from './FilterSections';

export const PANEL_WIDTH = 280;

export default function FilterPanel({ lib, facets, customShelves, open, onToggleSection, onHide }) {
  return (
    <Box
      component="aside"
      aria-label="Filters"
      data-testid="filter-panel"
      sx={{
        width: PANEL_WIDTH,
        flex: `0 0 ${PANEL_WIDTH}px`,
        position: 'sticky',
        top: 0,
        alignSelf: 'flex-start',
        height: `calc(100vh - ${geekLayout.topBarHeight}px)`,
        '@supports (height: 100dvh)': { height: `calc(100dvh - ${geekLayout.topBarHeight}px)` },
        overflowY: 'auto',
        overscrollBehavior: 'contain',
        borderRight: 1,
        borderColor: 'divider',
        px: 1.5,
        pb: 4,
        scrollbarWidth: 'thin',
      }}
    >
      <Box
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 1,
          bgcolor: 'background.default',
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          pt: 2,
          pb: 1,
          pl: 1,
          mb: 0.5,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Typography component="h2" sx={{ flex: 1, fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: '1.0625rem', letterSpacing: '-0.015em' }}>
          Filters
        </Typography>
        {lib.activeCount ? (
          <ButtonBase
            onClick={lib.clearAll}
            sx={{
              minHeight: 32,
              px: 1,
              borderRadius: '8px',
              fontSize: '0.8125rem',
              fontWeight: 600,
              color: 'text.secondary',
              '&:hover': { color: 'text.primary' },
              '&.Mui-focusVisible': { outline: 2, outlineStyle: 'solid', outlineColor: 'primary.main' },
            }}
          >
            Clear all
          </ButtonBase>
        ) : null}
        <Tooltip title="Hide filters">
          <IconButton aria-label="Hide filters" onClick={onHide} sx={{ width: 36, height: 36, color: 'text.secondary' }}>
            <HideIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      </Box>
      <FilterSections lib={lib} facets={facets} customShelves={customShelves} open={open} onToggleSection={onToggleSection} />
    </Box>
  );
}
