import React, { useState } from 'react';
import { Box, Button, Typography, useTheme } from '@mui/material';
import ArchiveOutlined from '@mui/icons-material/ArchiveOutlined';
import UnarchiveOutlined from '@mui/icons-material/UnarchiveOutlined';
import AutoAwesomeMosaic from '@mui/icons-material/AutoAwesomeMosaic';
import { geekLayout, useGeekShell } from '@geeksuite/ui';
import { useArchiveNotes } from '../../hooks/useArchiveNotes';
import { COMPOSE_MANY_MAX, COMPOSE_MANY_MIN, skipHint } from '../../utils/composeMany';
import { graphiteTokens, layout } from '../../theme/tokens';
import ComposeManyFlow from './ComposeManyFlow';

// Room the list leaves under its last row so the fixed bar never covers it.
export const SELECTION_BAR_SPACE = 120;

/**
 * The select-mode action bar (spec COMPOSE_MANY_AND_ARCHIVE U2): at the
 * bottom, in the thumb zone, just above the phone's tab bar; on desktop it
 * spans the content column right of the sidebar.
 *
 *   lists     → Archive (≥ 1) · Compose N notes (≥ 2; says how many it
 *               will skip — sketches, mind maps, locked notes)
 *   Archived  → Restore (≥ 1)
 *
 * Renders nothing outside select mode — and mounts no Apollo hooks either,
 * so a list that is not selecting (Home reads the store, not Apollo) pays
 * nothing for it. A failed archive/restore keeps the selection; a successful
 * one ends select mode.
 */
export default function SelectionBar({ selection, archivedView = false }) {
  if (!selection.active) return null;
  return <ActiveSelectionBar selection={selection} archivedView={archivedView} />;
}

function ActiveSelectionBar({ selection, archivedView }) {
  const theme = useTheme();
  const g = graphiteTokens(theme);
  const { isMobile, hasNav, bottomInset } = useGeekShell();
  const { archive, restore, busy } = useArchiveNotes();
  const [composing, setComposing] = useState(false);

  const { count, skipCount, ids } = selection;
  const usable = count - skipCount;
  const tooMany = count > COMPOSE_MANY_MAX;
  const canCompose = count >= COMPOSE_MANY_MIN && usable >= COMPOSE_MANY_MIN && !tooMany;
  let hint = '';
  if (!archivedView && count >= COMPOSE_MANY_MIN) {
    if (tooMany) hint = `Compose takes up to ${COMPOSE_MANY_MAX} notes at once`;
    else if (usable < COMPOSE_MANY_MIN) hint = 'Compose needs at least two notes it can read';
    else hint = skipHint(skipCount);
  }

  const onArchive = async () => {
    const done = await archive(ids);
    if (done) selection.exit();
  };
  const onRestore = async () => {
    const done = await restore(ids);
    if (done) selection.exit();
  };

  const btnSx = { textTransform: 'none', minHeight: 44, borderRadius: '8px', px: '16px', fontWeight: 600 };

  return (
    <>
      <Box aria-hidden sx={{ height: SELECTION_BAR_SPACE }} />
      <Box
        role="toolbar"
        aria-label="Selected notes"
        data-selection-bar=""
        sx={{
          position: 'fixed',
          left: hasNav && !isMobile ? geekLayout.sidebarWidth : 0,
          right: 0,
          bottom: `calc(${bottomInset}px + env(safe-area-inset-bottom, 0px))`,
          zIndex: theme.zIndex.appBar,
          bgcolor: g.paper,
          borderTop: `1px solid ${g.border}`,
          boxShadow: '0 -2px 8px rgba(0, 0, 0, 0.06)',
        }}
      >
        <Box sx={{ maxWidth: layout.contentWidth, mx: 'auto', px: { xs: '12px', sm: '16px' }, py: '8px' }}>
          {hint ? (
            <Typography
              data-selection-hint=""
              sx={{ fontSize: '0.8125rem', color: 'text.secondary', lineHeight: 1.4, mb: '6px' }}
            >
              {hint}
            </Typography>
          ) : null}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' }}>
            {archivedView ? (
              <Button
                variant="contained"
                disableElevation
                onClick={onRestore}
                disabled={count < 1 || busy}
                startIcon={<UnarchiveOutlined />}
                sx={{ ...btnSx, flex: { xs: 1, sm: 'initial' } }}
              >
                {count > 1 ? `Restore ${count} notes` : 'Restore'}
              </Button>
            ) : (
              <>
                <Button
                  variant="outlined"
                  color="inherit"
                  onClick={onArchive}
                  disabled={count < 1 || busy}
                  startIcon={<ArchiveOutlined />}
                  sx={{ ...btnSx, borderColor: g.border, flex: { xs: 1, sm: 'initial' } }}
                >
                  Archive
                </Button>
                <Button
                  variant="contained"
                  disableElevation
                  onClick={() => setComposing(true)}
                  disabled={!canCompose || busy}
                  startIcon={<AutoAwesomeMosaic />}
                  sx={{ ...btnSx, flex: { xs: 2, sm: 'initial' } }}
                >
                  {count >= COMPOSE_MANY_MIN ? `Compose ${count} notes` : 'Compose'}
                </Button>
              </>
            )}
          </Box>
        </Box>
      </Box>
      {composing ? (
        <ComposeManyFlow
          notes={selection.notes}
          onClose={() => setComposing(false)}
          onDone={() => { setComposing(false); selection.exit(); }}
        />
      ) : null}
    </>
  );
}
