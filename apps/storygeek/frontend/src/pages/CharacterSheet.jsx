import React from 'react';
import { Box, Typography, Card, CardContent, alpha } from '@mui/material';
import { useTheme } from '@mui/material/styles';

function CharacterSheet() {
  const theme = useTheme();
  const gold = theme.palette.codex?.gold || '#c9a84c';

  return (
    <Box>
      <Box sx={{ mb: 4, mt: 1 }}>
        <Typography variant="overline" sx={{ color: alpha(gold, 0.6) }}>Companions</Typography>
        <Typography variant="h2" sx={{ mt: 0.5 }}>Character Codex</Typography>
      </Box>

      <Card sx={{ textAlign: 'center', py: 6 }}>
        <CardContent>
          <Typography sx={{ fontSize: '2.5rem', mb: 2, opacity: 0.3 }}>{'\u{1F9D9}'}</Typography>
          <Typography variant="h4" sx={{ mb: 1 }}>The pages are blank... for now</Typography>
          <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 400, mx: 'auto' }}>
            Character management is being inscribed. Use the <code>/char</code> command during gameplay to view your companions.
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}

export default CharacterSheet;
