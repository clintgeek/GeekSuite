/** GOG / Epic / Amazon / Luna: no public library APIs, so the honest path is a pasted list. */
import React from 'react';
import { Box, Button, Typography } from '@mui/material';
import { ContentPasteOutlined as PasteIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import SettingsCard from './SettingsCard';

const STORES = ['GOG', 'Epic Games', 'Amazon / Prime Gaming', 'Amazon Luna'];

export default function StorefrontsCard() {
  const navigate = useNavigate();
  return (
    <SettingsCard id="storefronts" title="GOG, Epic, Amazon & Luna" description="None of these stores lets another app read your library, so they come in by list.">
      <Box component="ul" sx={{ m: 0, p: 0, display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 2 }}>
        {STORES.map((s) => (
          <Box component="li" key={s} sx={{ listStyle: 'none', px: 1.25, height: 28, display: 'inline-flex', alignItems: 'center', borderRadius: '6px', bgcolor: 'background.raised', border: 1, borderColor: 'divider', fontSize: '0.75rem', fontWeight: 500, color: 'text.secondary' }}>
            {s}
          </Box>
        ))}
      </Box>
      <Typography component="ol" sx={{ m: 0, pl: 2.5, fontSize: '0.875rem', lineHeight: 1.7, color: 'text.primary' }}>
        <li>Copy the titles from the store's library page (or its app).</li>
        <li>Add game → <b>Paste a list</b>, one title per line.</li>
        <li>Pick the storefront — every game gets a PC copy from that store.</li>
      </Typography>
      <Button variant="outlined" startIcon={<PasteIcon />} onClick={() => navigate('/add?tab=paste')} sx={{ mt: 2, color: 'text.primary' }}>
        Paste a list
      </Button>
      <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mt: 2, lineHeight: 1.6 }}>
        Coming later: importing a Playnite or Heroic Games Launcher export, which already knows your GOG, Epic and Amazon libraries.
      </Typography>
    </SettingsCard>
  );
}
