import React from 'react';
import { Box, Typography, Button, alpha } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { GeekEmptyState } from '@geeksuite/ui';
import D20 from '../components/primitives/D20';
import { fonts } from '../theme/theme';

function CharacterSheet() {
  const theme = useTheme();
  const c = theme.palette.candle;
  const { storyId } = useParams();

  return (
    <Box>
      <Box sx={{ mb: 8, mt: 2 }}>
        <Typography variant="overline" component="p" sx={{ color: c.accentLabel }}>Companions</Typography>
        <Typography variant="h2" component="h1" sx={{ mt: 1, fontSize: { xs: '1.6rem', md: '2rem' } }}>Character Codex</Typography>
      </Box>

      <Box sx={{
        textAlign: 'center', py: { xs: 12, md: 16 }, px: 4, borderRadius: '8px',
        border: `2px dashed ${c.rule}`, bgcolor: alpha(c.paper, 0.6),
      }}>
        <GeekEmptyState
          icon={<D20 size={64} color={c.accentLabel} strokeWidth={0.9} sx={{ mx: 'auto' }} />}
          title="The pages are blank… for now"
          titleSx={{ fontFamily: fonts.display, fontWeight: 700, fontSize: '1.3rem' }}
          description={
            <>Character management is being inscribed. Use the <code>/char</code> command during play to view your companions.</>
          }
          descriptionSx={{ maxWidth: 440, mx: 'auto', color: 'text.secondary' }}
          action={storyId ? (
            <Button component={RouterLink} to={`/play/${storyId}`} variant="outlined" sx={{ minHeight: 44, px: 5 }}>
              Back to the table
            </Button>
          ) : null}
        />
      </Box>
    </Box>
  );
}

export default CharacterSheet;
