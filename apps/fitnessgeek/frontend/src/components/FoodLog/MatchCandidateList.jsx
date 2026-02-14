import React from 'react';
import { List, ListItemButton, ListItemText, Chip, Box, Typography } from '@mui/material';

const sourceLabel = (src) => (src || 'food').toUpperCase();

const MatchCandidateList = ({ candidates = [], onSelect }) => {
  return (
    <List dense sx={{ p: 0 }}>
      {candidates.map((c) => (
        <ListItemButton key={c._id || c.name} onClick={() => onSelect?.(c)} sx={{ borderBottom: '1px solid #eee' }}>
          <ListItemText
            primary={
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{c.name}</Typography>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <Chip size="small" label={`${Math.round((c.score || 0) * 100)}%`} />
                  <Chip size="small" variant="outlined" label={sourceLabel(c.source)} />
                </Box>
              </Box>
            }
            secondary={
              <Box sx={{ display: 'flex', gap: 2, color: '#666' }}>
                {c.brand && <span>{c.brand}</span>}
                {c.serving && (
                  <span>{c.serving.size}{' '}{c.serving.unit}</span>
                )}
                {c.nutrition && <span>{Math.round(c.nutrition.calories_per_serving)} cal / serving</span>}
              </Box>
            }
          />
        </ListItemButton>
      ))}
    </List>
  );
};

export default MatchCandidateList;


