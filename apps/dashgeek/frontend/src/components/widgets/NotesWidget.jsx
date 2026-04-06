import React from 'react';
import { useQuery } from '@apollo/client';
import { Box, Skeleton } from '@mui/material';
import EditorialCard from '../EditorialCard';
import { DASH_RECENT_NOTES } from '../../graphql/queries';
import { tokens } from '../../theme';

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function NotesWidget({ delay = 0 }) {
  const { data, loading, error } = useQuery(DASH_RECENT_NOTES, {
    variables: { limit: 5 },
    fetchPolicy: 'cache-and-network',
  });

  if (loading && !data) {
    return (
      <EditorialCard index="05" dept="NoteGeek" kicker="The marginalia" delay={delay}>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} variant="text" height={22} sx={{ mb: 1 }} />
        ))}
      </EditorialCard>
    );
  }

  const notes = data?.dashRecentNotes || [];

  if (error || notes.length === 0) {
    return (
      <EditorialCard index="05" dept="NoteGeek" kicker="The marginalia" href="https://notegeek.clintgeek.com" delay={delay}>
        <Box sx={{ fontFamily: tokens.fontItalic, fontStyle: 'italic', color: tokens.boneFaint }}>
          {error ? 'Archive unreachable.' : 'No fresh entries in the commonplace book.'}
        </Box>
      </EditorialCard>
    );
  }

  return (
    <EditorialCard
      index="05"
      dept="NoteGeek"
      kicker="The marginalia"
      href="https://notegeek.clintgeek.com"
      delay={delay}
      meta={
        <>
          <span>{notes.length} recent entries</span>
          <span style={{ color: tokens.brass }}>Commonplace book</span>
        </>
      }
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, flex: 1 }}>
        {notes.slice(0, 5).map((note, i) => (
          <Box
            key={note.id}
            sx={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr auto',
              gap: 1.5,
              alignItems: 'baseline',
              pb: 1.25,
              borderBottom: i < Math.min(notes.length, 5) - 1 ? `1px solid ${tokens.rule}` : 'none',
            }}
          >
            <Box
              sx={{
                fontFamily: tokens.fontMono,
                fontSize: '0.52rem',
                color: tokens.brass,
                letterSpacing: '0.15em',
              }}
            >
              {String(i + 1).padStart(2, '0')}
            </Box>
            <Box
              sx={{
                fontFamily: tokens.fontDisplay,
                fontSize: '0.98rem',
                color: tokens.bone,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontWeight: 400,
              }}
            >
              {note.title || 'Untitled'}
            </Box>
            <Box
              sx={{
                fontFamily: tokens.fontItalic,
                fontStyle: 'italic',
                fontSize: '0.75rem',
                color: tokens.boneFaint,
              }}
            >
              {timeAgo(note.updatedAt)}
            </Box>
          </Box>
        ))}
      </Box>
    </EditorialCard>
  );
}
