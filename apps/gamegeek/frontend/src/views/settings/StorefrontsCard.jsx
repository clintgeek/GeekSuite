/** GOG / Epic / Amazon / Luna: no public library APIs — Playnite already reads them. */
import React from 'react';
import { Box, Button, Typography } from '@mui/material';
import { CloudDownloadOutlined as ImportIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import SettingsCard from './SettingsCard';

const STORES = ['GOG', 'Epic Games', 'Amazon / Prime Gaming', 'Amazon Luna'];

export default function StorefrontsCard() {
  const navigate = useNavigate();
  return (
    <SettingsCard id="storefronts" title="GOG, Epic, Amazon & Luna" description="None of these stores lets another app read your library directly — Playnite already does, so it's the way in.">
      <Box component="ul" sx={{ m: 0, p: 0, display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 2 }}>
        {STORES.map((s) => (
          <Box component="li" key={s} sx={{ listStyle: 'none', px: 1.25, height: 28, display: 'inline-flex', alignItems: 'center', borderRadius: '6px', bgcolor: 'background.raised', border: 1, borderColor: 'divider', fontSize: '0.75rem', fontWeight: 500, color: 'text.secondary' }}>
            {s}
          </Box>
        ))}
      </Box>
      <Typography component="ol" sx={{ m: 0, pl: 2.5, fontSize: '0.875rem', lineHeight: 1.7, color: 'text.primary' }}>
        <li>Install Playnite and let it index these libraries alongside your others.</li>
        <li>Export your Playnite library and import it below — hours and all.</li>
        <li>Not on Playnite? Add it manually — Add game → Search, or Enter manually.</li>
      </Typography>
      <Button variant="outlined" startIcon={<ImportIcon />} onClick={() => navigate('/settings#playnite')} sx={{ mt: 2, color: 'text.primary' }}>
        Import from Playnite
      </Button>
    </SettingsCard>
  );
}
