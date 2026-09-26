import React from 'react';
import { Button, Typography } from '@mui/material';
import Section from './Section';

export default function NotesSection({ notes, onEdit }) {
  return (
    <Section
      id="notes"
      title="Notes"
      action={
        <Button size="small" onClick={onEdit} sx={{ color: 'text.primary', fontWeight: 600 }}>
          {notes ? 'Edit' : 'Add notes'}
        </Button>
      }
    >
      {notes ? (
        <Typography sx={{ fontSize: '0.9375rem', lineHeight: 1.65, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{notes}</Typography>
      ) : (
        <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>Anything worth remembering: where the spare key is, what the dealer said.</Typography>
      )}
    </Section>
  );
}
