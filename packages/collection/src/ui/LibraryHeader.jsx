/**
 * Above the list: result count, Filters button (phone) or show-panel pill
 * (desktop, when the panel is hidden), Save view, sort, grid/list toggle, and
 * the active chips.
 *
 *   desktop:  [⇥ Filters 3]  124 games               [Save view] [Sort · A → Z] [▦/☰]
 *             Genre RPG ×  Store Steam ×  Clear all
 *
 *   phone:    [⚙ Filters · 3] [Sort]                          [☆] [▦/☰]
 *             124 games
 *             ← Genre RPG ×  Store Steam ×  Clear all →   (its own scrolling strip)
 *
 * `actions` (optional) is the app's own control(s), placed just before the
 * grid/list toggle in both layouts — BookGeek's ⋯ menu (export, select).
 * Without `onToggleView` there is no toggle (the app shows it elsewhere).
 *
 * The count is a polite live region: it is how a screen reader hears that a
 * filter did something. It keeps its last value while the next answer loads,
 * so it never announces "0" on the way to "124".
 */
import React, { forwardRef } from 'react';
import { Box, Button, IconButton, Tooltip, Typography } from '@mui/material';
import {
  BookmarkAddOutlined as SaveIcon,
  GridView as GridIcon,
  KeyboardDoubleArrowRight as ShowPanelIcon,
  TuneRounded as FiltersIcon,
  ViewList as ListIcon,
} from '@mui/icons-material';
import { useCollectionConfig } from '../config';
import ActiveChips from './ActiveChips';
import { countText, pillSx } from './filterUi';
import SortMenu from './SortMenu';

const roundIconSx = { width: 44, height: 44, border: 1, borderColor: 'border', borderRadius: '999px', color: 'text.primary' };

export const FiltersButton = forwardRef(function FiltersButton({ count, onClick }, ref) {
  return (
    <Button
      ref={ref}
      variant="outlined"
      onClick={onClick}
      startIcon={<FiltersIcon sx={{ fontSize: 18 }} />}
      aria-haspopup="dialog"
      aria-label={count ? `Filters, ${count} active` : 'Filters'}
      data-testid="filters-button"
      sx={{
        ...pillSx,
        ...(count ? { borderColor: 'primary.main', '&:hover': { borderColor: 'primary.main', bgcolor: 'transparent' } } : null),
      }}
    >
      Filters
      {count ? (
        <Box component="span" sx={{ ml: 0.75, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
          · {count}
        </Box>
      ) : null}
    </Button>
  );
});

export default function LibraryHeader({
  sorts,
  isDesktop,
  total,
  lib,
  chips,
  panelOpen,
  onShowPanel,
  onOpenSheet,
  filtersButtonRef,
  onSave,
  view,
  onToggleView,
  actions = null,
}) {
  const { state } = lib;
  const { displayFont, displayWeight, noun } = useCollectionConfig();
  const count = (
    <Typography
      component="p"
      role="status"
      aria-live="polite"
      data-testid="result-count"
      sx={{
        m: 0,
        minWidth: 0,
        fontVariantNumeric: 'tabular-nums',
        ...(isDesktop
          ? { fontFamily: displayFont, fontSize: '1.125rem', fontWeight: displayWeight ?? 600, letterSpacing: '-0.01em', color: 'text.primary' }
          : { fontSize: '0.8125rem', color: 'text.secondary' }),
      }}
      noWrap
    >
      {countText(total, noun) || ' '}
    </Typography>
  );

  // Optional: an app that moves the toggle into its own menu on a narrow
  // phone row (BookGeek) passes no `onToggleView`.
  const viewToggle = onToggleView ? (
    <IconButton onClick={onToggleView} aria-label={view === 'list' ? 'Show as covers' : 'Show as a list'} sx={roundIconSx}>
      {view === 'list' ? <GridIcon sx={{ fontSize: 20 }} /> : <ListIcon sx={{ fontSize: 20 }} />}
    </IconButton>
  ) : null;

  const sort = (
    <SortMenu sorts={sorts} sort={state.sort} dir={state.dir} onSort={lib.setSort} onReshuffle={lib.reshuffle} compact={!isDesktop} />
  );

  if (isDesktop) {
    return (
      <Box>
        <Box sx={{ minHeight: 48, display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {!panelOpen ? (
            <Button
              variant="outlined"
              onClick={onShowPanel}
              startIcon={<ShowPanelIcon sx={{ fontSize: 18 }} />}
              aria-label={lib.activeCount ? `Show filters, ${lib.activeCount} active` : 'Show filters'}
              sx={pillSx}
            >
              Filters
              {lib.activeCount ? (
                <Box component="span" sx={{ ml: 0.75, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  · {lib.activeCount}
                </Box>
              ) : null}
            </Button>
          ) : null}
          <Box sx={{ flex: 1, minWidth: 0 }}>{count}</Box>
          <Button variant="text" onClick={onSave} startIcon={<SaveIcon sx={{ fontSize: 18 }} />} sx={{ ...pillSx, color: 'text.secondary', '&:hover': { color: 'text.primary', bgcolor: 'transparent' } }}>
            Save view
          </Button>
          {sort}
          {actions}
          {viewToggle}
        </Box>
        {chips.length ? (
          <Box sx={{ mt: 1 }}>
            <ActiveChips chips={chips} onRemove={(c) => lib.update(c.patch)} onClearAll={lib.clearAll} />
          </Box>
        ) : null}
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ minHeight: 48, display: 'flex', alignItems: 'center', gap: 1 }}>
        <FiltersButton ref={filtersButtonRef} count={lib.activeCount} onClick={onOpenSheet} />
        {sort}
        <Box sx={{ flex: 1 }} />
        {lib.activeCount || (state.filter.q || '').trim() ? (
          <Tooltip title="Save view">
            <IconButton onClick={onSave} aria-label="Save view" sx={roundIconSx}>
              <SaveIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>
        ) : null}
        {actions}
        {viewToggle}
      </Box>
      <Box sx={{ mt: 0.5 }}>{count}</Box>
      {chips.length ? (
        <Box sx={{ mt: 0.25 }}>
          <ActiveChips scroll chips={chips} onRemove={(c) => lib.update(c.patch)} onClearAll={lib.clearAll} />
        </Box>
      ) : null}
    </Box>
  );
}
