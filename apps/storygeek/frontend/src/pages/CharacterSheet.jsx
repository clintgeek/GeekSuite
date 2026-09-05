import React from 'react';
import { Box, Typography, Card, CardContent } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { GeekEmptyState } from '@geeksuite/ui';

function CharacterSheet() {
  const theme = useTheme();
  const gold = theme.palette.codex?.gold || '#c9a84c';
  // Muted section-label gold. Solid and mode-aware (theme.js) — the
  // alpha()-diluted gold it replaces failed AA on every codex surface.
  const goldMuted = theme.palette.codex?.goldMuted || gold;

  return (
    <Box>
      <Box sx={{ mb: 4, mt: 1 }}>
        <Typography variant="overline" sx={{ color: goldMuted }}>Companions</Typography>
        <Typography variant="h2" sx={{ mt: 0.5 }}>Character Codex</Typography>
      </Box>

      <Card sx={{ textAlign: 'center', py: 6 }}>
        <CardContent>
          <GeekEmptyState
            icon={<Typography sx={{ fontSize: '2.5rem' }}>{'\u{1F9D9}'}</Typography>}
            iconSx={{ opacity: 0.3 }}
            title="The pages are blank... for now"
            description={
              <>Character management is being inscribed. Use the <code>/char</code> command during gameplay to view your companions.</>
            }
          />
        </CardContent>
      </Card>
    </Box>
  );
}

export default CharacterSheet;
