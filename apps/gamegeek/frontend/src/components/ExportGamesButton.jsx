/**
 * "Export" in the library header: downloads every game the current filter
 * and sort match as a CSV (utils/exportGamesCsv.js), the way BookGeek's
 * "Export these books" does. Text on desktop; a round icon on a phone, where
 * the header row is tight.
 */
import React, { useState } from 'react';
import { Button, CircularProgress, IconButton, Tooltip } from '@mui/material';
import { FileDownloadOutlined as ExportIcon } from '@mui/icons-material';
import { useApolloClient } from '@apollo/client';
import { useToast } from '@geeksuite/ui';
import { exportLibraryCsv } from '../utils/exportGamesCsv';

const LABEL = 'Export these games (CSV)';

export default function ExportGamesButton({ variables, customShelves = [], isDesktop = false }) {
  const client = useApolloClient();
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const count = await exportLibraryCsv(client, variables, { customShelves });
      notify(count === 1 ? 'Exported 1 game' : `Exported ${count.toLocaleString('en-US')} games`, { tone: 'success' });
    } catch {
      notify('Couldn’t export. Try again.', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const icon = busy ? <CircularProgress size={16} aria-label="Exporting" /> : <ExportIcon sx={{ fontSize: 18 }} />;

  return isDesktop ? (
    <Button
      variant="text"
      onClick={run}
      disabled={busy}
      startIcon={icon}
      aria-label={LABEL}
      sx={{ minHeight: 44, borderRadius: '999px', px: 1.5, whiteSpace: 'nowrap', color: 'text.secondary', '&:hover': { color: 'text.primary', bgcolor: 'transparent' } }}
    >
      {busy ? 'Exporting…' : 'Export'}
    </Button>
  ) : (
    <Tooltip title={LABEL}>
      <span>
        {/* The header's own round outlined icon (collection LibraryHeader's
            roundIconSx), so it sits with the view toggle, not bare beside it. */}
        <IconButton onClick={run} disabled={busy} aria-label={LABEL} sx={{ width: 44, height: 44, border: 1, borderColor: 'border', borderRadius: '999px', color: 'text.primary' }}>
          {busy ? <CircularProgress size={18} aria-label="Exporting" /> : <ExportIcon sx={{ fontSize: 20 }} />}
        </IconButton>
      </span>
    </Tooltip>
  );
}
