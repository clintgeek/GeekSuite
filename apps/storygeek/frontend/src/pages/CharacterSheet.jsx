import React from 'react';
import { Box, Typography, Card, CardContent } from '@mui/material';

function CharacterSheet() {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Character Management
      </Typography>

      <Card>
        <CardContent>
          <Typography variant="body1">
            Character management features coming soon. Use /char command in stories to view character information.
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}

export default CharacterSheet;